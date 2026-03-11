const DB_NAME = "inventarioDB";
const STORE_NAME = "datos";

let okSound;
let errorSound;

async function cargarSonidos() {

  okSound = new Audio("wood_plank_flicks.mp3");
  errorSound = new Audio("beep_short.mp3");

  okSound.preload = "auto";
  errorSound.preload = "auto";

  okSound.playsInline = true;
  errorSound.playsInline = true;

}

document.addEventListener("touchstart", function () {

  if (!okSound || !errorSound) return;

  okSound.play().then(() => {
    okSound.pause();
    okSound.cloneNode().play().catch(()=>{});
  }).catch(()=>{});

  errorSound.play().then(() => {
    errorSound.pause();
    errorSound.cloneNode().play().catch(()=>{});
  }).catch(()=>{});

}, { once: true });



function abrirDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = e => {
      const db = e.target.result;
      db.createObjectStore(STORE_NAME);
    };

    request.onsuccess = e => resolve(e.target.result);
    request.onerror = e => reject(e);
  });
}

async function guardarDatos(clave, datos) {
  const db = await abrirDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.put(datos, clave);
}

async function leerDatos(clave) {
  const db = await abrirDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);

  return new Promise(resolve => {
    const req = store.get(clave);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}


// ----------------------------
// VARIABLES GLOBALES
// ----------------------------


let codigo_a_referencia = {};
let referencia_a_descripcion = {};
let referenciasSinCodigo = [];

let referencia_a_codigo = {};

let usuariosPermitidos = [];
let usuarioLogueado = null;

let modoPDA = false;

const DIAS_OFFLINE_PERMITIDOS = 15;

let inventario = {
  fecha: "",
  almacen: "",
  vendedor: "",
  articulos: {},       // cantidades por referencia
  orden: []             // 👈 orden de entrada
};

async function guardarInventarioTemporal() {

  try {

    await guardarDatos("inventario_en_progreso", inventario);

    localStorage.setItem(
      "inventario_backup",
      JSON.stringify(inventario)
    ); // backup rápido

  } catch (e) {

    console.error("Error guardando inventario", e);

  }

}

let permitirEscaneo = false;

// 🔧 NUEVO — aprendizaje
let modoAprendizaje = false;
let codigoPendienteAprender = null;
let equivalenciasAprendidas = {};

let etiquetasSeleccionadas = [];

let editandoCantidad = false;

// ----------------------------
// INICIO
// ----------------------------

document.addEventListener("DOMContentLoaded", async () => {

  await cargarSonidos();   // 🔊 cargar sonidos primero

  /* ========= AUTOSAVE CADA 5s ========= */

  setInterval(() => {

    if (inventario && Object.keys(inventario.articulos).length > 0) {
      guardarInventarioTemporal();
    }

  }, 5000);


  /* ========= GUARDADO DE EMERGENCIA ========= */

  document.addEventListener("visibilitychange", () => {

    if (document.visibilityState === "hidden") {
      guardarInventarioTemporal();
    }

  });

  window.addEventListener("pagehide", () => {
    guardarInventarioTemporal();
  });



  /* ========= LOGIN ========= */

  await cargarUsuarios();
  verificarSesion();


  /* ========= RECUPERAR INVENTARIO ========= */

  const backup = localStorage.getItem("inventario_backup");

  const inventarioGuardado =
    await leerDatos("inventario_en_progreso")
    || (backup ? JSON.parse(backup) : null);


  if (inventarioGuardado) {

    const recuperar = confirm(
      "Hay un inventario sin guardar. ¿Quieres recuperarlo?"
    );

    if (recuperar) {

      inventario =
        typeof inventarioGuardado === "string"
          ? JSON.parse(inventarioGuardado)
          : inventarioGuardado;

      document.getElementById("pantallaInicio").style.display = "none";
      document.getElementById("pantallaEscaner").style.display = "block";

      await cargarCamaras();
      
      actualizarLista();

      mostrarMensaje("📦 Inventario recuperado", "ok");

      if (modoPDA) {
        activarModoPDA();
      } else {
        iniciarScanner();
      }

    } else {

      /* eliminar inventario antiguo */

      localStorage.removeItem("inventario_backup");

      const db = await abrirDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete("inventario_en_progreso");

    }

  }


  /* ========= FECHA POR DEFECTO ========= */

  document.getElementById("fecha").value =
    new Date().toISOString().split("T")[0];


  /* ========= ALMACEN (3 letras mayúsculas) ========= */

  const almacenInput = document.getElementById("almacen");

  almacenInput.addEventListener("input", function () {
    this.value = this.value.toUpperCase().slice(0, 3);
  });


  /* ========= CARGA DE DATOS ========= */

  await cargarEquivalencias();
  cargarEquivalenciasAprendidas();
  await cargarReferenciasSinCodigo();


  /* ========= SERVICE WORKER ========= */

  registrarServiceWorker();


  /* ========= DETECTAR CÁMARAS ========= */

  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    cargarCamaras();
  }


  /* ========= INPUT CANTIDAD ========= */

  const cantidadInput = document.getElementById("cantidad");

  cantidadInput.addEventListener("focus", function () {
    editandoCantidad = true;
    this.value = "";
  });

  cantidadInput.addEventListener("blur", function () {
    editandoCantidad = false;
  });


  /* ========= TAP PARA ENFOQUE ========= */

  const scanner = document.getElementById("scanner");

  scanner.addEventListener("click", () => {

    permitirEscaneo = true;

    try {

      const track = Quagga.CameraAccess.getActiveTrack();

      if (track && track.applyConstraints) {

        track.applyConstraints({
          advanced: [
            { focusMode: "continuous" }
          ]
        });

      }

    } catch(e) {

      console.log("Tap focus no disponible");

    }

  });

});


async function cargarUsuarios() {
  try {

    const res = await fetch("usuarios.json");

    if (!res.ok) throw new Error("offline");

    usuariosPermitidos = await res.json();

    localStorage.setItem("usuarios_cache", JSON.stringify(usuariosPermitidos));

    console.log("Usuarios cargados desde internet");

  } catch (e) {

    const cache = localStorage.getItem("usuarios_cache");

    if (cache) {
      usuariosPermitidos = JSON.parse(cache);
      console.log("Usuarios cargados desde cache");
    } else {
      console.error("No hay usuarios disponibles");
    }

  }
}

async function cargarReferenciasSinCodigo() {
  try {
    const response = await fetch("referencias_sin_codigo_barras.json");
    if (!response.ok) throw new Error("No se pudo cargar referencias");

    referenciasSinCodigo = await response.json();

    const select = document.getElementById("selectManual");
    if (!select) return;


    referenciasSinCodigo.forEach(item => {
      const option = document.createElement("option");
      option.value = item.referencia;
      option.textContent = `${item.descripcion} (${item.referencia})`;
      select.appendChild(option);

      // Guardamos también la descripción para la lista final
      referencia_a_descripcion[item.referencia] = item.descripcion;
    });

  } catch (error) {
    console.error("Error cargando referencias sin código:", error);
  }
};



// ----------------------------
// CARGAR EXCEL EQUIVALENCIAS
// ----------------------------
let equivalencias = {};

async function cargarEquivalencias() {

  try {

    const response = await fetch("equivalencias.json");
    const data = await response.json();

    equivalencias = data;

    await guardarDatos("equivalencias", data);

    console.log("Equivalencias cargadas desde internet");

  } catch (error) {

    console.log("Sin internet, cargando desde IndexedDB");

    const data = await leerDatos("equivalencias");

    if (data) {
      equivalencias = data;
      console.log("Equivalencias cargadas desde almacenamiento local");
    } else {
      console.error("No hay datos guardados");
      return;
    }

  }

  // 🔥 CONSTRUIR MAPAS PARA EL ESCÁNER
  codigo_a_referencia = {};
  referencia_a_codigo = {};
  referencia_a_descripcion = referencia_a_descripcion || {};

  equivalencias.forEach(item => {

    let codigo = String(item.codigo).replace(/^0+/, "");
    const referencia = item.referencia;
    const descripcion = item.descripcion;

    codigo_a_referencia[codigo] = referencia;
    referencia_a_codigo[referencia] = codigo;
    referencia_a_descripcion[referencia] = descripcion;

  });

  console.log("Total códigos cargados:", Object.keys(codigo_a_referencia).length);

}



function cargarEquivalenciasAprendidas() {

  const guardadas = localStorage.getItem("equivalencias_aprendidas");
  if (!guardadas) return;

  equivalenciasAprendidas = JSON.parse(guardadas);

  for (let codigo in equivalenciasAprendidas) {

    const referencia = equivalenciasAprendidas[codigo];

    codigo_a_referencia[codigo] = referencia;
    referencia_a_codigo[referencia] = codigo; // 🔥 AÑADIR
  }
}

// ----------------------------
// EMPEZAR INVENTARIO
// ----------------------------
function empezar() {

  const fechaInput = document.getElementById("fecha");
  const almacenInput = document.getElementById("almacen");
  const vendedorInput = document.getElementById("vendedor");

  if (!fechaInput.value || !almacenInput.value || !vendedorInput.value) {
    alert("Completa todos los campos");
    return;
  }

  inventario.fecha = fechaInput.value;
  inventario.almacen = almacenInput.value;
  inventario.vendedor = vendedorInput.value;
  inventario.articulos = {};
  inventario.orden = [];

  document.getElementById("pantallaInicio").style.display = "none";
  document.getElementById("pantallaEscaner").style.display = "block";

  if (modoPDA) {
  activarModoPDA();
  return;
}

  iniciarScanner();
}

async function cargarCamaras() {

  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  stream.getTracks().forEach(track => track.stop());

  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(d => d.kind === "videoinput");

  const select = document.getElementById("selectorCamara");
  select.innerHTML = "";

  videoDevices.forEach((device, i) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.text = device.label || "Cámara " + (i + 1);
    select.appendChild(option);
  });

  // cambiar cámara
  select.onchange = () => {

    const deviceId = select.value;

    try {
      Quagga.stop();
    } catch(e){}

    // esperar un poco a que libere la cámara
    setTimeout(() => {
      iniciarScanner(deviceId);
    }, 300);

  };

}
// ----------------------------
// INICIAR ESCÁNER
// ----------------------------
function iniciarScanner(deviceId = null) {

  Quagga.init({
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: document.querySelector('#scanner'),
      constraints: deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        : {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },

      area: {
        top: "27.5%",
        right: "7.5%",
        left: "7.5%",
        bottom: "27.5%"
      }
    },

    decoder: {
      readers: ["ean_reader", "ean_8_reader", "upc_reader"]
    },

    locate: true

  }, function (err) {

    if (err) {
      console.error(err);
      return;
    }

    Quagga.start();

  });

  Quagga.offDetected();

  Quagga.onDetected(function (result) {

    if (!permitirEscaneo) return;
    if (!result?.codeResult?.code) return;

    let code = result.codeResult.code.replace(/\D/g, "");
    code = code.replace(/^0+/, "");

    permitirEscaneo = false;

    if (modoAprendizaje) {

      codigoPendienteAprender = code;

      document.getElementById("codigoAprendidoMostrado").textContent =
        "Código leído: " + code;

      document.getElementById("codigoAprendidoMostrado").style.display = "block";

      mostrarMensaje("✅ Código leído", "ok");
      mostrarFormularioAprendizaje();
      return;
    }

    procesarCodigo(code);

  });

}

function activarModoPDA() {

  permitirEscaneo = false;

  const input = document.getElementById("inputPDA");
  input.value = "";

  // 🔒 foco permanente (CLAVE)
  setInterval(() => {

    if (editandoCantidad) return;

    if (document.activeElement !== input) {
      input.focus();
    }

  }, 300);

  mostrarMensaje("📟 Modo PDA activo", "ok");

  input.oninput = () => {
    // el lector escribe aquí
  };

  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      const codigo = input.value.replace(/\D/g, "").replace(/^0+/, "");
      input.value = "";

      if (!codigo) return;

      if (modoAprendizaje) {
        codigoPendienteAprender = codigo;

        document.getElementById("codigoAprendidoMostrado").textContent =
          "Código leído: " + codigo;
        document.getElementById("codigoAprendidoMostrado").style.display = "block";

        mostrarFormularioAprendizaje();
        mostrarMensaje("🧠 Código listo para asociar", "ok");
        return;
      }

procesarCodigo(codigo);
    }
  };
}

function mostrarFormularioAprendizaje() {
  document.getElementById("aprendizajeBox").style.display = "block";
}

function guardarCodigoAprendido() {

  const ref = document
    .getElementById("inputReferenciaAprendida")
    .value
    .trim();

  if (!ref) {
    mostrarMensaje("❌ Escribe una referencia", "error");
    return;
  }

  if (!referencia_a_descripcion[ref]) {
    mostrarMensaje("❌ Referencia no válida", "error");
    return;
  }

  // Guardar en localStorage
  equivalenciasAprendidas =
    JSON.parse(localStorage.getItem("equivalencias_aprendidas") || "{}");

  equivalenciasAprendidas[codigoPendienteAprender] = ref;

  localStorage.setItem(
    "equivalencias_aprendidas",
    JSON.stringify(equivalenciasAprendidas)
  );

  // Activar inmediatamente
  codigo_a_referencia[codigoPendienteAprender] = ref;

  // 🔥 La descripción YA existe si la referencia está en tu JSON
  // referencia_a_descripcion[ref] ya está cargada

  // Reset estado
  modoAprendizaje = false;
  codigoPendienteAprender = null;
  document.getElementById("inputReferenciaAprendida").value = "";
  document.getElementById("aprendizajeBox").style.display = "none";

  mostrarMensaje("🧠 Código aprendido correctamente", "ok");
  permitirEscaneo = true;
  document.getElementById("btnCancelarAprendizaje").style.display = "none";
}

                

let deferredPrompt;

window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const btn = document.getElementById("btnInstalar");
    btn.style.display = "block";
});

document.getElementById("btnInstalar").addEventListener("click", async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log("Resultado instalación:", outcome);
        deferredPrompt = null;
        document.getElementById("btnInstalar").style.display = "none";
    }
});

function esPWAenIOS() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    window.matchMedia('(display-mode: standalone)').matches
  );
}

async function compartirExcelIOS(blob, nombreArchivo) {

  const file = new File([blob], nombreArchivo, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: "Inventario",
      text: "Guardar inventario"
    });
  } else {
    alert("Este iPhone no permite compartir archivos desde la app");
  }
}

function esIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function esSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

function estaEnModoStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
}

if (esIOS() && !estaEnModoStandalone()) {

  const aviso = document.createElement("div");

  aviso.style.position = "fixed";
  aviso.style.bottom = "0";
  aviso.style.left = "0";
  aviso.style.right = "0";
  aviso.style.background = "#111";
  aviso.style.color = "#fff";
  aviso.style.padding = "15px";
  aviso.style.textAlign = "center";
  aviso.style.zIndex = "9999";
  aviso.style.fontSize = "14px";

  if (!esSafari()) {
    aviso.innerHTML = `
      ⚠️ Para instalar esta app en iPhone:<br><br>
      1️⃣ Abre esta página en <b>Safari</b><br>
      2️⃣ Pulsa el botón 📤<br>
      3️⃣ Toca "Añadir a pantalla de inicio"<br><br>
      <button onclick="this.parentElement.remove()">Cerrar</button>
    `;
  } else {
    aviso.innerHTML = `
      📲 Para instalar esta app:<br><br>
      1️⃣ Pulsa el botón 📤 (Compartir)<br>
      2️⃣ Elige "Añadir a pantalla de inicio"<br><br>
      <button onclick="this.parentElement.remove()">Cerrar</button>
    `;
  }

  document.body.appendChild(aviso);
}

function exportarCodigosAprendidos() {

  const aprendidos = JSON.parse(
    localStorage.getItem("equivalencias_aprendidas") || "{}"
  );

  const resultado = [];

  for (let codigo in aprendidos) {
    const referencia = aprendidos[codigo];
    const descripcion = referencia_a_descripcion[referencia];

    if (!descripcion) continue;

    resultado.push({
      descripcion: descripcion,
      codigo: codigo,
      referencia: referencia
    });
  }

  if (resultado.length === 0) {
    mostrarMensaje("❌ No hay códigos aprendidos", "error");
    return;
  }

  const json = JSON.stringify(resultado, null, 2);

  const blob = new Blob(
    [json],
    { type: "application/json;charset=utf-8;" }
  );

  const fecha = new Date().toISOString().split("T")[0];
  const nombre = `equivalencias_aprendidas_${fecha}.json`;

  const url = URL.createObjectURL(blob);

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (isIOS) {
    // Truco iOS: abrir en la MISMA pestaña
    window.location.href = url;
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  mostrarMensaje("✅ JSON exportado", "ok");
}




// ===============================
// BOTÓN AYUDA
// ===============================

document.getElementById("btnAyuda").addEventListener("click", () => {
  document.getElementById("modalAyuda").style.display = "flex";
});

function cerrarAyuda() {
  document.getElementById("modalAyuda").style.display = "none";
}



function añadirManual() {

  const select = document.getElementById("selectManual");
  if (!select) return;

  const referencia = select.value;
  const cantidad =
    parseInt(document.getElementById("cantidad").value) || 1;

  if (!referencia) {
    mostrarMensaje("❌ Selecciona un artículo", "error");
    return;
  }

  // ➕ añadir o sumar cantidad
  if (inventario.articulos[referencia]) {
    inventario.articulos[referencia] += cantidad;

    // 🔼 mover arriba (último usado)
    inventario.orden = inventario.orden.filter(r => r !== referencia);
    inventario.orden.unshift(referencia);

  } else {
    inventario.articulos[referencia] = cantidad;

    // 🆕 nuevo → arriba del todo
    inventario.orden.unshift(referencia);
  }

  // 🔄 reset
  select.value = "";
  document.getElementById("cantidad").value = 1;

  mostrarMensaje("✅ Artículo añadido manualmente", "ok");
  actualizarLista();
  guardarInventarioTemporal();
}


// ----------------------------
// 🔧 MODO APRENDIZAJE
// ----------------------------
function activarModoAprendizaje() {
  modoAprendizaje = true;
  codigoPendienteAprender = null;
  permitirEscaneo = false;

  document.getElementById("btnCancelarAprendizaje").style.display = "block";
  document.getElementById("aprendizajeBox").style.display = "block";

  // 🔄 limpiar buscador
  document.getElementById("buscadorAprendizaje").value = "";
  document.getElementById("resultadosAprendizaje").innerHTML = "";

  mostrarMensaje("🧠 Escanea el código para asociar", "ok");
}

function cancelarAprendizaje() {
  modoAprendizaje = false;
  codigoPendienteAprender = null;

  permitirEscaneo = false;

  document.getElementById("btnCancelarAprendizaje").style.display = "none";
  document.getElementById("aprendizajeBox").style.display = "none";
  document.getElementById("codigoAprendidoMostrado").style.display = "none";
  document.getElementById("inputReferenciaAprendida").value = "";

  mostrarMensaje("❌ Grabación cancelada", "error");
}

function variantesCodigo(codigo) {
  const variantes = new Set();

  variantes.add(codigo);

  // EAN-13 → UPC-A
  if (codigo.length === 13 && codigo.startsWith("0")) {
    variantes.add(codigo.slice(1));
  }

  // UPC-A → EAN-13
  if (codigo.length === 12) {
    variantes.add("0" + codigo);
  }

  if (codigo.length === 11) {
    variantes.add("00" + codigo);
  }
  if (codigo.length === 10) {
    variantes.add("000" + codigo);
  }

  return [...variantes];
}


// ----------------------------
// PROCESAR CÓDIGO
// ----------------------------
async function procesarCodigo(codigo) {

  // 🔒 seguridad extra (por si alguien llama sin normalizar)
  codigo = String(codigo).replace(/^0+/, "");

  let cantidad =
    parseInt(document.getElementById("cantidad").value) || 1;

  const referencia = codigo_a_referencia[codigo];

  if (!referencia) {
    mostrarMensaje("❌ Código no encontrado", "error");
    return;
  }

  // ➕ añadir o sumar cantidad
  if (inventario.articulos[referencia]) {
    inventario.articulos[referencia] += cantidad;

    // 🔼 mover arriba (último usado)
    inventario.orden = inventario.orden.filter(r => r !== referencia);
    inventario.orden.unshift(referencia);

  } else {
    inventario.articulos[referencia] = cantidad;

    // 🆕 nuevo → arriba del todo
    inventario.orden.unshift(referencia);
  }

  document.getElementById("cantidad").value = 1;

  await guardarInventarioTemporal();
  actualizarLista();
  mostrarMensaje("✅ Artículo añadido", "ok");
      
}

function esSamsung() {
  return /samsung/i.test(navigator.userAgent);
}

// ----------------------------
// ACTUALIZAR LISTA
// ----------------------------
function actualizarLista() {

  const ul = document.getElementById("listaArticulos");
  ul.innerHTML = "";

  inventario.orden.forEach(ref => {

    const li = document.createElement("li");

    li.innerHTML = `
      <b>${referencia_a_descripcion[ref] || "Artículo no encontrado"}</b><br>
      Ref: ${ref} — Cantidad: ${inventario.articulos[ref]}
    `;

    ul.appendChild(li);
  });
}


// ----------------------------
// MENSAJE VERDE / ROJO
// ----------------------------
function mostrarMensaje(texto, tipo) {

    let m = document.getElementById("mensajeEstado");

    m.className = "mensaje " + tipo;
    m.innerHTML = texto;
    m.style.display = "block";

    if (tipo === "ok") {
        okSound.cloneNode().play().catch(()=>{});
        okSound.play().catch(()=>{});
    }

    if (tipo === "error") {
        errorSound.cloneNode().play().catch(()=>{});
        errorSound.play().catch(()=>{});
    }

    setTimeout(() => {
        m.style.display = "none";
    }, 1000);
}

function formatearFecha(fechaISO) {
    const [anio, mes, dia] = fechaISO.split("-");
    return `${dia}/${mes}/${anio}`;
}

// ----------------------------
// FINALIZAR Y GENERAR EXCEL
// ----------------------------
async function finalizar() {

  /* ========= 1. PREPARAR DATOS ========= */

  const datos = [];

  for (let ref in inventario.articulos) {
    datos.push({
      fecha: formatearFecha(inventario.fecha),
      almacen: inventario.almacen,
      referencia: ref,
      cantidad: inventario.articulos[ref],
      numero_vendedor: inventario.vendedor
    });
  }

  if (datos.length === 0) {
    mostrarMensaje("❌ No hay artículos para exportar", "error");
    return;
  }

  /* ========= 2. CREAR EXCEL ========= */

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(datos);

  XLSX.utils.book_append_sheet(wb, ws, "Inventario");

  const wbout = XLSX.write(wb, {
    bookType: "xlsx",
    type: "array"
  });

  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  const nombreArchivo =
    `${inventario.almacen}_${obtenerFechaHoraArchivo()}.xlsx`;

  /* ========= 3. DETECCIÓN ENTORNO ========= */

  const ua = navigator.userAgent.toLowerCase();
  const esIOS = /iphone|ipad|ipod/.test(ua);
  const esPWA = window.matchMedia("(display-mode: standalone)").matches;

  /* ========= 4. FUNCIÓN LIMPIAR INVENTARIO ========= */

  async function limpiarInventarioGuardado() {

    try {

      localStorage.removeItem("inventario_backup");

      const db = await abrirDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete("inventario_en_progreso");

    } catch (e) {
      console.error("Error limpiando inventario guardado", e);
    }

  }

  /* ========= 5. iOS PWA → SHARE API ========= */

  if (esIOS && esPWA) {

    const file = new File([blob], nombreArchivo, {
      type: blob.type
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {

      mostrarMensaje(
        "📤 Pulsa Guardar en Archivos para conservar el Excel",
        "ok"
      );

      await navigator.share({
        files: [file],
        title: "Inventario",
        text: "Guardar inventario"
      });

      await limpiarInventarioGuardado();

    } else {

      alert("Este iPhone no permite compartir archivos desde la app.");

    }

    return;
  }

  /* ========= 6. iOS SAFARI → ABRIR ARCHIVO ========= */

  if (esIOS && !esPWA) {

    const url = URL.createObjectURL(blob);

    mostrarMensaje(
      "📂 Se abrirá el Excel. Pulsa Compartir → Guardar en Archivos",
      "ok"
    );

    setTimeout(() => {
      window.open(url, "_blank");
    }, 300);

    setTimeout(() => URL.revokeObjectURL(url), 30000);

    await limpiarInventarioGuardado();

    return;
  }

  /* ========= 7. ANDROID / PC → DESCARGA NORMAL ========= */

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");

  a.href = url;
  a.download = nombreArchivo;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 10000);

  mostrarMensaje("✅ Inventario descargado correctamente", "ok");

  await limpiarInventarioGuardado();

}

function importarInventarioExcel(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = evt => {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(sheet);

      sumarInventarioDesdeExcel(filas);
      mostrarMensaje("✅ Inventario importado y sumado", "ok");

    } catch (error) {
      console.error(error);
      mostrarMensaje("❌ Error al importar Excel", "error");
    }
  };

  reader.readAsArrayBuffer(file);

  // 🔄 permitir volver a importar el mismo archivo si hace falta
  e.target.value = "";
}

function obtenerFechaHoraArchivo() {
  const ahora = new Date();

  const dia = String(ahora.getDate()).padStart(2, "0");
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const anio = ahora.getFullYear();

  const hora = String(ahora.getHours()).padStart(2, "0");
  const minuto = String(ahora.getMinutes()).padStart(2, "0");

  return `${dia}_${mes}_${anio}_${hora}_${minuto}`;
}

function sumarInventarioDesdeExcel(filas) {
  if (!Array.isArray(filas)) return;

  filas.forEach(fila => {
    const ref = String(fila.referencia || "").trim();
    const cantidad = parseInt(fila.cantidad, 10) || 0;

    if (!ref || cantidad <= 0) return;

    if (inventario.articulos[ref]) {
      inventario.articulos[ref] += cantidad;

      // mover arriba (último usado)
      inventario.orden = inventario.orden.filter(r => r !== ref);
      inventario.orden.unshift(ref);

    } else {
      inventario.articulos[ref] = cantidad;
      inventario.orden.unshift(ref);
    }
  });

  actualizarLista();
}

document
  .getElementById("importarExcel")
  .addEventListener("change", importarInventarioExcel);

// ----------------------------
// SERVICE WORKER
// ----------------------------
function registrarServiceWorker() {

  if ('serviceWorker' in navigator) {

    navigator.serviceWorker
      .register('service-worker.js')
      .then(reg => {
        console.log("Service Worker registrado:", reg.scope);
      })
      .catch(err => {
        console.log("Error registrando SW:", err);
      });

  }

}

async function login() {
  const u = document.getElementById("loginUsuario").value.trim();
  const p = document.getElementById("loginPassword").value.trim();

  try {
    await cargarUsuarios();

    const valido = usuariosPermitidos.find(
      x => x.usuario === u && x.password === p
    );

    if (!valido) {
      mostrarMensaje("❌ Usuario no autorizado", "error");
      return;
    }

    const ahora = Date.now();

    localStorage.setItem("auth_usuario", u);
    localStorage.setItem("auth_ultimo_ok", ahora.toString());

    usuarioLogueado = u;

    document.getElementById("pantallaLogin").style.display = "none";
    document.getElementById("pantallaInicio").style.display = "block";

    mostrarMensaje("✅ Acceso correcto", "ok");

  } catch (e) {
    mostrarMensaje("❌ Sin conexión", "error");
  }

  if (u === "PDA") {
  modoPDA = true;
}
}

function verificarSesion() {
  const u = localStorage.getItem("auth_usuario");
  const t = parseInt(localStorage.getItem("auth_ultimo_ok"), 10);

  if (!u || !t) {
    mostrarLogin();
    return;
  }

  const dias = (Date.now() - t) / (1000 * 60 * 60 * 24);

  if (dias > DIAS_OFFLINE_PERMITIDOS) {
    localStorage.removeItem("auth_usuario");
    localStorage.removeItem("auth_ultimo_ok");
    mostrarLogin();
    mostrarMensaje("🔒 Requiere conexión para validar", "error");
    return;
  }

  usuarioLogueado = u;
  document.getElementById("pantallaLogin").style.display = "none";
  document.getElementById("pantallaInicio").style.display = "block";
  if (usuarioLogueado === "PDA") {
  modoPDA = true;
}
}

function mostrarLogin() {
  document.getElementById("pantallaLogin").style.display = "block";
  document.getElementById("pantallaInicio").style.display = "none";
}

// ===============================
// BOTÓN MENOS EN CANTIDAD (SOLO NEGATIVO)
// ===============================
const btnMenos = document.getElementById("btnCantidadNegativa");

if (btnMenos) {
  btnMenos.addEventListener("click", () => {
    const input = document.getElementById("cantidad");
    let valor = parseInt(input.value, 10);

    if (isNaN(valor) || valor === 0) {
      input.value = -1;
      return;
    }

    // 👉 SOLO poner negativo, nunca volver a positivo
    input.value = Math.abs(valor) * -1;
  });
}

const buscadorAprendizaje =
  document.getElementById("buscadorAprendizaje");
const resultadosAprendizaje =
  document.getElementById("resultadosAprendizaje");

if (buscadorAprendizaje) {
  buscadorAprendizaje.addEventListener("input", () => {
    const texto = buscadorAprendizaje.value
      .toLowerCase()
      .trim();

    resultadosAprendizaje.innerHTML = "";

    if (texto.length < 2) return;

    // 🔍 buscamos en TODAS las equivalencias cargadas
    const resultados = Object.entries(referencia_a_descripcion)
      .filter(([ref, desc]) =>
        ref.toLowerCase().includes(texto) ||
        desc.toLowerCase().includes(texto)
      )
      .slice(0, 25); // límite por rendimiento

    resultados.forEach(([ref, desc]) => {
      const li = document.createElement("li");
      li.innerHTML = `<b>${desc}</b><br>Ref: ${ref}`;

      li.onclick = () => {
        document.getElementById(
          "inputReferenciaAprendida"
        ).value = ref;

        buscadorAprendizaje.value = "";
        resultadosAprendizaje.innerHTML = "";
      };

      resultadosAprendizaje.appendChild(li);
    });
  });
}

function abrirListadoEtiquetas() {

  etiquetasSeleccionadas = [];
  renderListaEtiquetas();

  document.getElementById("buscadorEtiquetas").value = "";
  document.getElementById("resultadosEtiquetas").innerHTML = "";

  document.getElementById("modalEtiquetas").style.display = "flex";
  cargarBuscadorEtiquetas();
}

function cerrarListadoEtiquetas() {
  document.getElementById("modalEtiquetas").style.display = "none";
}

function cargarBuscadorEtiquetas() {

  const input = document.getElementById("buscadorEtiquetas");
  const resultados = document.getElementById("resultadosEtiquetas");

  input.oninput = () => {

    const texto = input.value.toLowerCase().trim();
    resultados.innerHTML = "";

    if (texto.length < 2) return;

    const resultadosFiltrados = Object.entries(referencia_a_descripcion)
      .filter(([ref, desc]) =>
        ref.toLowerCase().includes(texto) ||
        desc.toLowerCase().includes(texto)
      )
      .slice(0, 25);

    resultadosFiltrados.forEach(([ref, desc]) => {

      const li = document.createElement("li");
      li.innerHTML = `<b>${desc}</b><br>Ref: ${ref}`;

      li.onclick = () => añadirEtiqueta(ref, desc);

      resultados.appendChild(li);
    });
  };
}

function añadirEtiqueta(referencia, descripcion) {

  // 🔒 evitar duplicados
  if (!etiquetasSeleccionadas.find(a => a.Referencia === referencia)) {
    etiquetasSeleccionadas.push({
      Referencia: referencia,
      Descripcion: descripcion
    });
  }

  renderListaEtiquetas();

  // 🔥 LIMPIAR BUSCADOR
  const input = document.getElementById("buscadorEtiquetas");
  const resultados = document.getElementById("resultadosEtiquetas");

  input.value = "";
  resultados.innerHTML = "";

  input.blur(); // 🔥 quita foco (muy importante en móvil)
}

function renderListaEtiquetas() {

  const lista = document.getElementById("listaEtiquetas");
  lista.innerHTML = "";

  etiquetasSeleccionadas.forEach(a => {

    const li = document.createElement("li");
    li.textContent = a.Referencia + " - " + a.Descripcion;

    lista.appendChild(li);

  });
}

function eliminarEtiqueta(index) {
  etiquetasSeleccionadas.splice(index, 1);
  renderListaEtiquetas();
}

function generarPDFEtiquetasSeleccionadas() {

  if (!etiquetasSeleccionadas || etiquetasSeleccionadas.length === 0) {
    alert("No hay artículos seleccionados");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");

  const COLS = 3;
  const ROWS = 8;

  const LABEL_WIDTH = 70;
  const LABEL_HEIGHT = 35;

  const MARGIN_X = 10;
  const MARGIN_Y = 15;

  const BARCODE_HEIGHT_MM = 7.5;
  const BARCODE_GAP = 2; // pequeño espacio visual

  let col = 0;
  let row = 0;

  etiquetasSeleccionadas.forEach((a) => {

    const codigo = referencia_a_codigo[a.Referencia];
    if (!codigo) return;

    let formato = "CODE128";
    if (/^\d{13}$/.test(codigo)) formato = "EAN13";
    else if (/^\d{12}$/.test(codigo)) formato = "UPC";

    // === Posición base etiqueta (en jsPDF Y crece hacia abajo)
    const x = MARGIN_X + col * LABEL_WIDTH;
    const y = MARGIN_Y + row * LABEL_HEIGHT;

    const centerX = x + LABEL_WIDTH / 2;

    // ===== DESCRIPCIÓN (ARRIBA) =====
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);

    const descripcionY = y + 6;

    doc.text(
      a.Descripcion.substring(0, 45),
      centerX,
      descripcionY,
      { align: "center" }
    );

    // ===== REFERENCIA (DEBAJO) =====
    doc.setFont("helvetica", "normal");

    const refY = descripcionY + 4;

    doc.text(
      "Ref: " + a.Referencia,
      centerX,
      refY,
      { align: "center" }
    );

    // ===== GENERAR BARCODE =====
    const canvas = document.createElement("canvas");

    JsBarcode(canvas, codigo, {
      format: formato,
      displayValue: false,
      width: 1.8,
      height: 40,
      margin: 0
    });

    const imgData = canvas.toDataURL("image/png");

    // Escalar solo por altura real
    const pxToMm = 0.264583;

    const realWidthMM = canvas.width * pxToMm;
    const realHeightMM = canvas.height * pxToMm;

    const scale = BARCODE_HEIGHT_MM / realHeightMM;

    const finalWidth = realWidthMM * scale;
    const finalHeight = BARCODE_HEIGHT_MM;

    const barcodeY = refY + BARCODE_GAP;
    const barcodeX = centerX - finalWidth / 2;

    doc.addImage(
      imgData,
      "PNG",
      barcodeX,
      barcodeY,
      finalWidth,
      finalHeight
    );

    // ===== NÚMERO DEBAJO DEL CÓDIGO =====
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);

    const codigoTextoY = barcodeY + finalHeight + 3;

    doc.text(
      codigo,
      centerX,
      codigoTextoY,
      { align: "center" }
    );
    // ===== AVANZAR =====
    col++;
    if (col === COLS) {
      col = 0;
      row++;
    }

    if (row === ROWS) {
      doc.addPage();
      col = 0;
      row = 0;
    }

  });

  const ahora = new Date();

  const year = ahora.getFullYear();
  const month = String(ahora.getMonth() + 1).padStart(2, "0");
  const day = String(ahora.getDate()).padStart(2, "0");
  const hour = String(ahora.getHours()).padStart(2, "0");
  const minute = String(ahora.getMinutes()).padStart(2, "0");

  const nombreArchivo = `etiquetas_${year}.${month}.${day}.${hour}.${minute}.pdf`;

  doc.save(nombreArchivo);

  mostrarMensaje("✅ Etiquetas generadas correctamente", "ok");
}