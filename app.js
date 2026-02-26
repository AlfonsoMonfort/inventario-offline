// ----------------------------
// VARIABLES GLOBALES
// ----------------------------
let codigo_a_referencia = {};
let referencia_a_descripcion = {};
let referenciasSinCodigo = [];
let numeroOCRDetectado = null;
let modoOCRActivo = false;
let ocrInterval = null;
let ocrTimeout = null;
let ocrUltimo = null;
let ocrRepeticiones = 0;
let ocrProcesado = false;

let usuariosPermitidos = [];
let usuarioLogueado = null;

let modoPDA = false;

const DIAS_OFFLINE_PERMITIDOS = 15;

const DEBUG_OCR = true;

let inventario = {
  fecha: "",
  almacen: "",
  vendedor: "",
  articulos: {},       // cantidades por referencia
  orden: []             // 👈 orden de entrada
};

let permitirEscaneo = false;

// 🔧 NUEVO — aprendizaje
let modoAprendizaje = false;
let codigoPendienteAprender = null;
let equivalenciasAprendidas = {};

// ----------------------------
// INICIO
// ----------------------------
document.addEventListener("DOMContentLoaded", async () => {

  await cargarUsuarios();
  verificarSesion();

  

  document.getElementById("fecha").value =
    new Date().toISOString().split("T")[0];

  const almacenInput = document.getElementById("almacen");

  almacenInput.addEventListener("input", function () {
    this.value = this.value.toUpperCase().slice(0, 3);
  });

  window.hayInventarioGuardado =
  !!localStorage.getItem("inventario_guardado");

  await cargarEquivalencias();
  cargarEquivalenciasAprendidas();
  await cargarReferenciasSinCodigo();
  registrarServiceWorker();

  const cantidadInput = document.getElementById("cantidad");
  cantidadInput.addEventListener("focus", function () {
    this.value = "";
  });
  const scanner = document.getElementById("scanner");

  scanner.addEventListener("click", () => {

    permitirEscaneo = true; // 📦 escáner normal
  });
});

async function cargarUsuarios() {
  try {
    const res = await fetch("usuarios.json");
    if (!res.ok) throw new Error("No se pudo cargar usuarios");

    usuariosPermitidos = await res.json();
    console.log("Usuarios cargados:", usuariosPermitidos.length);
  } catch (e) {
    alert("Error cargando usuarios");
    console.error(e);
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
async function cargarEquivalencias() {

  try {

    let datosGuardados = localStorage.getItem("equivalencias");

    if (datosGuardados) {
      console.log("Cargando equivalencias desde almacenamiento local");
      let datos = JSON.parse(datosGuardados);

      datos.forEach(item => {
        const codigoNormalizado = String(item.codigo).replace(/^0+/, "");

        codigo_a_referencia[codigoNormalizado] = item.referencia;
        referencia_a_descripcion[item.referencia] = item.descripcion;
      });

      console.log(
        "Total códigos cargados:",
        Object.keys(codigo_a_referencia).length
      );
      return;
    }

    console.log("Descargando equivalencias por primera vez");

    const response = await fetch("equivalencias.json");

    if (!response.ok) {
      throw new Error("No se pudo cargar equivalencias.json");
    }

    const datos = await response.json();

    console.log("Datos recibidos:", datos);

    // Guardamos TAL CUAL llegaron (pero se normalizan al usar)
    localStorage.setItem("equivalencias", JSON.stringify(datos));

    datos.forEach(item => {
      const codigoNormalizado = String(item.codigo).replace(/^0+/, "");

      codigo_a_referencia[codigoNormalizado] = item.referencia;
      referencia_a_descripcion[item.referencia] = item.descripcion;
    });

    console.log(
      "Total códigos cargados:",
      Object.keys(codigo_a_referencia).length
    );

  } catch (error) {
    console.log("Error cargando equivalencias:", error);
  }
}

// 🔧 NUEVO
function cargarEquivalenciasAprendidas() {
    const guardadas = localStorage.getItem("equivalencias_aprendidas");
    if (!guardadas) return;

    equivalenciasAprendidas = JSON.parse(guardadas);

    for (let codigo in equivalenciasAprendidas) {
        codigo_a_referencia[codigo] = equivalenciasAprendidas[codigo];
    }
}

// ----------------------------
// EMPEZAR INVENTARIO
// ----------------------------
function empezar() {

  if (window.hayInventarioGuardado) {

    const continuar = confirm(
      "Hay un inventario guardado.\n\n" +
      "Aceptar → Continuar inventario\n" +
      "Cancelar → Empezar uno nuevo"
    );

    if (continuar) {
      cargarInventarioGuardado();
      return;
    } else {
      localStorage.removeItem("inventario_guardado");
      window.hayInventarioGuardado = false;
      // sigue creando uno nuevo
    }
  }

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

  document.getElementById("pantallaInicio").style.display = "none";
  document.getElementById("pantallaEscaner").style.display = "block";

  if (modoPDA) {
  activarModoPDA();
  return;
}

  iniciarScanner();
}

function cargarInventarioGuardado() {

  const datos = JSON.parse(
    localStorage.getItem("inventario_guardado")
  );

  inventario = datos.inventario;

  document.getElementById("pantallaInicio").style.display = "none";
  document.getElementById("pantallaEscaner").style.display = "block";

  actualizarLista();
  if (modoPDA) {
    activarModoPDA();
  } else {
    iniciarScanner();
  }

  mostrarMensaje("↩️ Inventario recuperado", "ok");
}




// ----------------------------
// INICIAR ESCÁNER
// ----------------------------
function iniciarScanner() {

  Quagga.init({
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: document.querySelector('#scanner'),
      constraints: {
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
    locate: false
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

      if (codigo) {
        procesarCodigo(codigo);
      }
    }
  };
}

function activarModoOCR() {
  if (ocrInterval) clearInterval(ocrInterval);
  if (ocrTimeout) clearTimeout(ocrTimeout);

  ocrProcesado = false; // 🔒 reset candado

  modoOCRActivo = true;
  permitirEscaneo = false;

  mostrarMensaje("🔍 Buscando referencia…", "ok");

  ocrInterval = setInterval(() => {
    if (!modoOCRActivo) return;
    leerOCRContinuo();
  }, 700);

  ocrTimeout = setTimeout(() => {
    if (modoOCRActivo) {
      cancelarOCR();
      mostrarMensaje("❌ No se detectó referencia", "error");
    }
  }, 10000);
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



function leerOCRContinuo() {

  // ⛔ seguridad básica
  if (!modoOCRActivo || ocrProcesado) return;

  const video = document.querySelector("#scanner video");
  const frame = document.querySelector(".scanner-frame");
  const debugText = document.getElementById("ocrTextDebug");

  if (!video || !frame || !video.videoWidth) return;

  if (debugText) {
    debugText.innerText = "OCR activo…";
  }

  // ----------------------------
  // 📐 CÁLCULO DE ZONA OCR
  // ----------------------------
  const videoRect = video.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();

  const scaleX = video.videoWidth / videoRect.width;
  const scaleY = video.videoHeight / videoRect.height;

  let sx = (frameRect.left - videoRect.left) * scaleX;
  let sy = (frameRect.top - videoRect.top) * scaleY;
  let sw = frameRect.width * scaleX;
  let sh = frameRect.height * scaleY;

  // 🔍 recorte central (solo números)
  const recorte = 0.45;
  const dx = sw * (1 - recorte) / 2;
  const dy = sh * (1 - recorte) / 2;

  sx += dx;
  sy += dy;
  sw *= recorte;
  sh *= recorte;

  // ----------------------------
  // 🎨 CANVAS OCR
  // ----------------------------
  const canvas = document.createElement("canvas");
  canvas.width = sw * 2;
  canvas.height = sh * 2;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  // 🔲 binarización fuerte
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const v = avg > 145 ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
  }

  ctx.putImageData(imgData, 0, 0);

  // ----------------------------
  // 🔠 TESSERACT
  // ----------------------------
  Tesseract.recognize(
    canvas,
    "eng",
    {
      tessedit_char_whitelist: "0123456789",
      classify_bln_numeric_mode: 1
    }
  ).then(result => {

    if (ocrProcesado) return;

    const texto = (result.data.text || "")
      .replace(/\s+/g, "")
      .replace(/[^0-9]/g, "");

    if (debugText) {
      debugText.innerText = `OCR lee: "${texto || "∅"}"`;
    }

    // ❌ no parece una referencia válida
    if (!/^\d{5,7}$/.test(texto)) {
      ocrUltimo = null;
      ocrRepeticiones = 0;
      return;
    }

    // ----------------------------
    // 🔁 CONFIRMACIÓN POR REPETICIÓN
    // ----------------------------
    if (texto === ocrUltimo) {
      ocrRepeticiones++;
    } else {
      ocrUltimo = texto;
      ocrRepeticiones = 1;
    }

    if (ocrRepeticiones < 2) return;

    // ----------------------------
    // ✅ OCR CONFIRMADO (UNA SOLA VEZ)
    // ----------------------------
    ocrProcesado = true;
    modoOCRActivo = false;

    ocrUltimo = null;
    ocrRepeticiones = 0;

    cancelarOCR();

   // 🔍 comprobar referencia existente
if (!referencia_a_descripcion[texto]) {
  mostrarMensaje("❌ Referencia no existe", "error");
  permitirEscaneo = true;
  return;
}

// 🆕 guardar referencia detectada
numeroOCRDetectado = texto;

// ⛔ parar OCR hasta decisión
modoOCRActivo = false;

// 🖥 mostrar confirmación OCR
document.getElementById("ocrConfirmBox").style.display = "block";
document.getElementById("ocrReferenciaDetectada").textContent =
  "Referencia detectada: " + texto;

mostrarMensaje("📋 Confirma la referencia", "ok");


  });
}


function aceptarOCR() {
  document.getElementById("ocrConfirmBox").style.display = "none";
  modoOCRActivo  = false;
  document.getElementById("ocrBox").style.display = "none";

  if (!numeroOCRDetectado) return;

  if (!referencia_a_descripcion[numeroOCRDetectado]) {
    mostrarMensaje("❌ Referencia no existe", "error");
    permitirEscaneo = true;
    return;
  }

  const cantidad =
    parseInt(document.getElementById("cantidad").value) || 1;

  // ➕ añadir o sumar cantidad
  if (inventario.articulos[numeroOCRDetectado]) {
    inventario.articulos[numeroOCRDetectado] += cantidad;

    // 🔼 mover arriba (último usado)
    inventario.orden = inventario.orden.filter(
      r => r !== numeroOCRDetectado
    );
    inventario.orden.unshift(numeroOCRDetectado);

  } else {
    inventario.articulos[numeroOCRDetectado] = cantidad;

    // 🆕 nuevo → arriba del todo
    inventario.orden.unshift(numeroOCRDetectado);
  }

  actualizarLista();

  // 🔄 reset
  numeroOCRDetectado = null;
  permitirEscaneo = true;
  document.getElementById("cantidad").value = 1;

  mostrarMensaje("✅ Referencia añadida", "ok");
}


function cancelarOCR() {
  const box = document.getElementById("ocrConfirmBox");
  if (box) box.style.display = "none";

 
  modoOCRActivo = false;
  numeroOCRDetectado = null;

  if (ocrInterval) {
    clearInterval(ocrInterval);
    ocrInterval = null;
  }

  if (ocrTimeout) {
    clearTimeout(ocrTimeout);
    ocrTimeout = null;
  }

  permitirEscaneo = true;

  const debugCanvas = document.getElementById("ocr-debug-canvas");
  if (debugCanvas) debugCanvas.remove();
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
}


// ----------------------------
// 🔧 MODO APRENDIZAJE
// ----------------------------
function activarModoAprendizaje() {
  modoAprendizaje = true;
  codigoPendienteAprender = null;
  permitirEscaneo = true;

  document.getElementById("btnCancelarAprendizaje").style.display = "block";

  mostrarMensaje("📸 Toca pantalla y escanea el código", "ok");
}

function cancelarAprendizaje() {
  modoAprendizaje = false;
  codigoPendienteAprender = null;
  permitirEscaneo = false;

  document.getElementById("btnCancelarAprendizaje").style.display = "none";
  document.getElementById("aprendizajeBox").style.display = "none";

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
function procesarCodigo(codigo) {

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

  mostrarMensaje("✅ Artículo añadido", "ok");
  actualizarLista();
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
        let okSound = document.getElementById("okSound");
        okSound.currentTime = 0;
        okSound.play();
    }

    if (tipo === "error") {
        let errorSound = document.getElementById("errorSound");
        errorSound.currentTime = 0;
        errorSound.play();
    }

    setTimeout(() => {
        m.style.display = "none";
    }, 1000);
}

function formatearFecha(fechaISO) {
    const [anio, mes, dia] = fechaISO.split("-");
    return `${dia}/${mes}/${anio}`;
}

function guardarInventario() {

  const datos = {
    inventario: inventario
  };

  localStorage.setItem(
    "inventario_guardado",
    JSON.stringify(datos)
  );

  window.hayInventarioGuardado = true;

  mostrarMensaje("💾 Inventario guardado", "ok");
}

// ----------------------------
// FINALIZAR Y GENERAR EXCEL
// ----------------------------
function finalizar() {

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

  /* ========= 4. iOS PWA → SHARE API ========= */

  if (esIOS && esPWA) {

    const file = new File([blob], nombreArchivo, {
      type: blob.type
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {

      mostrarMensaje(
        "📤 Pulsa Guardar en Archivos para conservar el Excel",
        "ok"
      );

      navigator.share({
        files: [file],
        title: "Inventario",
        text: "Guardar inventario"
      });

    } else {
      alert("Este iPhone no permite compartir archivos desde la app.");
    }

    return;
  }

  /* ========= 5. iOS SAFARI → ABRIR ARCHIVO ========= */

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
    return;
  }

  /* ========= 6. ANDROID / PC → DESCARGA NORMAL ========= */

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = nombreArchivo;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 10000);

  mostrarMensaje("✅ Inventario descargado correctamente", "ok");
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
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('service-worker.js')
        .then(function (registration) {
          console.log('Service Worker registrado:', registration.scope);
        })
        .catch(function (error) {
          console.log('Error registrando Service Worker:', error);
        });
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