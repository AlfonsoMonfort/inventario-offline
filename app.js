// ----------------------------
// VARIABLES GLOBALES
// ----------------------------
let codigo_a_referencia = {};
let referencia_a_descripcion = {};
let referenciasSinCodigo = [];
let modoAprendizaje = false;
let codigoPendienteAprendizaje = null;

let inventario = {
    fecha: "",
    almacen: "",
    vendedor: "",
    articulos: {}
};

let permitirEscaneo = false;


// ----------------------------
// INICIO
// ----------------------------
document.addEventListener("DOMContentLoaded", async () => {

    document.getElementById("fecha").value =
    new Date().toISOString().split("T")[0];

    // FORZAR MAYÚSCULAS EN ALMACEN
    const almacenInput = document.getElementById("almacen");
    almacenInput.addEventListener("input", function () {
        this.value = this.value.toUpperCase();
    });

    await cargarEquivalencias();
    await cargarReferenciasSinCodigo();
    registrarServiceWorker();

    const cantidadInput = document.getElementById("cantidad");
    if (cantidadInput) {
      cantidadInput.addEventListener("focus", function () {
        this.value = "";
      });
    }

});


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
      let datos = JSON.parse(datosGuardados);
      datos.forEach(item => {
        codigo_a_referencia[item.codigo] = item.referencia;
        referencia_a_descripcion[item.referencia] = item.descripcion;
      });
    } else {

      const response = await fetch("equivalencias.json");
      if (!response.ok) throw new Error("No se pudo cargar equivalencias.json");

      const datos = await response.json();
      localStorage.setItem("equivalencias", JSON.stringify(datos));

      datos.forEach(item => {
        codigo_a_referencia[item.codigo] = item.referencia;
        referencia_a_descripcion[item.referencia] = item.descripcion;
      });
    }

    // === Cargar equivalencias aprendidas ===
    const aprendidas = JSON.parse(
      localStorage.getItem("equivalencias_aprendidas") || "{}"
    );

    Object.keys(aprendidas).forEach(codigo => {
      codigo_a_referencia[codigo] = aprendidas[codigo];
    });

  } catch (error) {
    console.log("Error cargando equivalencias:", error);
  }
}


function activarAprendizaje() {
  modoAprendizaje = true;
  codigoPendienteAprendizaje = null;
  permitirEscaneo = true;
  mostrarMensaje("📸 Escanea el código a aprender", "ok");
}

function esSamsung() {
  return /samsung/i.test(navigator.userAgent);
}

// ----------------------------
// EMPEZAR INVENTARIO
// ----------------------------
function empezar() {

  const fechaInput = document.getElementById("fecha");
  const almacenInput = document.getElementById("almacen");
  const vendedorInput = document.getElementById("vendedor");

  // Validación básica
  if (!fechaInput.value || !almacenInput.value || !vendedorInput.value) {
    alert("Completa todos los campos");
    return;
  }

  // Guardar datos del inventario
  inventario.fecha = fechaInput.value;
  inventario.almacen = almacenInput.value;
  inventario.vendedor = vendedorInput.value;
  inventario.articulos = {};

  // Cambiar de pantalla
  document.getElementById("pantallaInicio").style.display = "none";
  document.getElementById("pantallaEscaner").style.display = "block";

  // Preparar input de cantidad (ahora SÍ existe en el DOM)
  const cantidadInput = document.getElementById("cantidad");
  if (cantidadInput) {
    cantidadInput.value = "";
    cantidadInput.addEventListener("focus", () => {
      cantidadInput.value = "";
    });
  }

  // Arrancar escáner
  iniciarScanner();
}


function calcularAreaDesdeMarco() {
  const scanner = document.getElementById("scanner");
  const frame = document.querySelector(".scanner-frame");
  const video = scanner.querySelector("video");

  if (!video.videoWidth || !video.videoHeight) return null;

  const frameRect = frame.getBoundingClientRect();
  const videoRect = video.getBoundingClientRect();

  // Posición del marco respecto al vídeo real
  const topPx = frameRect.top - videoRect.top;
  const leftPx = frameRect.left - videoRect.left;
  const bottomPx = videoRect.bottom - frameRect.bottom;
  const rightPx = videoRect.right - frameRect.right;

  const top = (topPx / videoRect.height) * 100;
  const bottom = (bottomPx / videoRect.height) * 100;
  const left = (leftPx / videoRect.width) * 100;
  const right = (rightPx / videoRect.width) * 100;

  const clamp = v => Math.max(0, Math.min(100, v));
  if (esSamsung()) {
    return {
      top: "15%",
      bottom: "15%",
      left: "5%",
      right: "5%"
    };
  }

  // resto de móviles → cálculo exacto
  return {
    top: `${clamp(top)}%`,
    bottom: `${clamp(bottom)}%`,
    left: `${clamp(left)}%`,
    right: `${clamp(right)}%`
  };
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
      focusMode: "continuous"
    }
    },
    decoder: {
      readers: ["ean_reader", "ean_8_reader", "upc_reader"]
    },
    locate: !esSamsung()
  }, function (err) {
    if (err) {
      console.error(err);
      return;
    }

    Quagga.start();

    const video = document.querySelector("#scanner video");
    if (!video) return;

    video.addEventListener("loadedmetadata", () => {

      const area = calcularAreaDesdeMarco();
      if (!area) return;

      Quagga.stop();

      Quagga.init({
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: document.querySelector('#scanner'),
          constraints: {
            facingMode: "environment"
          },
          area
        },
        decoder: {
          readers: ["ean_reader", "ean_8_reader", "upc_reader"]
        },
        locate: !esSamsung()
      }, () => Quagga.start());

    }, { once: true });
  });

  document.getElementById("scanner")
    .addEventListener("click", () => permitirEscaneo = true);

  Quagga.onDetected(function (result) {
  if (!permitirEscaneo) return;
  if (!result?.codeResult?.code) return;

  const code = result.codeResult.code.replace(/\D/g, "");
  if (![8, 12, 13].includes(code.length)) return;

  permitirEscaneo = false;

  // ===============================
  // MODO APRENDIZAJE
  // ===============================
  if (modoAprendizaje) {

    codigoPendienteAprendizaje = code;

    mostrarMensaje(
      "📌 Código detectado. Selecciona referencia y pulsa Añadir",
      "ok"
    );

    return; // ⛔ NO sigue al inventario
  }

  procesarCodigo(code);
});



function añadirManual() {

  const select = document.getElementById("selectManual");
  if (!select) return;

  const referencia = select.value;
  const cantidad = parseInt(document.getElementById("cantidad").value);

  if (!referencia) {
    mostrarMensaje("❌ Selecciona un artículo", "error");
    return;
  }

  // ===============================
  // GUARDAR CÓDIGO APRENDIDO
  // ===============================
  if (modoAprendizaje && codigoPendienteAprendizaje) {

    const aprendidas = JSON.parse(
      localStorage.getItem("equivalencias_aprendidas") || "{}"
    );

    aprendidas[codigoPendienteAprendizaje] = referencia;
    localStorage.setItem(
      "equivalencias_aprendidas",
      JSON.stringify(aprendidas)
    );

    codigo_a_referencia[codigoPendienteAprendizaje] = referencia;

    modoAprendizaje = false;
    codigoPendienteAprendizaje = null;

    select.value = "";
    document.getElementById("cantidad").value = 1;

    mostrarMensaje("✅ Código aprendido correctamente", "ok");
    return;
  }

  // === flujo manual normal ===
  if (inventario.articulos[referencia]) {
    inventario.articulos[referencia] += cantidad;
  } else {
    inventario.articulos[referencia] = cantidad;
  }

  select.value = "";
  document.getElementById("cantidad").value = 1;

  mostrarMensaje("✅ Artículo añadido manualmente", "ok");
  actualizarLista();
}



// ----------------------------
// PROCESAR CÓDIGO
// ----------------------------
function procesarCodigo(codigo) {

    let cantidad = parseInt(document.getElementById("cantidad").value);

    let referencia =
    codigo_a_referencia[codigo] ||
    codigo_a_referencia[codigo.padStart(13, "0")] ||
    codigo_a_referencia[codigo.replace(/^0/, "")];

    if (!referencia) {
        mostrarMensaje("❌ Código no encontrado", "error");
        return;
    }

    if (inventario.articulos[referencia]) {
        inventario.articulos[referencia] += cantidad;
    } else {
        inventario.articulos[referencia] = cantidad;
    }

    document.getElementById("cantidad").value = 1;

    mostrarMensaje("✅ Artículo añadido", "ok");
    actualizarLista();
}


// ----------------------------
// ACTUALIZAR LISTA
// ----------------------------
function actualizarLista() {

    let ul = document.getElementById("listaArticulos");
    ul.innerHTML = "";

    for (let ref in inventario.articulos) {

        let li = document.createElement("li");

        li.innerHTML = `
            <b>${referencia_a_descripcion[ref] || "Artículo no encontrado"}</b><br>
            Ref: ${ref} — Cantidad: ${inventario.articulos[ref]}
        `;

        ul.appendChild(li);
    }
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

// ----------------------------
// FINALIZAR Y GENERAR EXCEL
// ----------------------------
function finalizar() {

    let datos = [];

    for (let ref in inventario.articulos) {

        datos.push({
            fecha: formatearFecha(inventario.fecha),
            almacen: inventario.almacen,
            referencia: ref,
            cantidad: inventario.articulos[ref],
            numero_vendedor: inventario.vendedor
        });
    }

    let wb = XLSX.utils.book_new();
    let ws = XLSX.utils.json_to_sheet(datos);
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");

    let nombre = `inventario.${inventario.almacen}.${formatearFecha(inventario.fecha)}.xlsx`;

    const wbout = XLSX.write(wb, {
  bookType: "xlsx",
  type: "array"
});

const blob = new Blob([wbout], {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
});

const url = URL.createObjectURL(blob);

// iOS → abrir para compartir
if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
  window.open(url);
} else {
  // resto → descarga normal
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

setTimeout(() => URL.revokeObjectURL(url), 1000);


    location.reload();
}



// ----------------------------
// SERVICE WORKER
// ----------------------------
function registrarServiceWorker() {

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('service-worker.js')
                .then(function (registration) {
                    console.log('Service Worker registrado:', registration.scope);
                })
                .catch(function (error) {
                    console.log('Error registrando Service Worker:', error);
                });
        });
    }
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


// ===============================
// BOTÓN AYUDA
// ===============================

const btnAyuda = document.getElementById("btnAyuda");
if (btnAyuda) {
  btnAyuda.addEventListener("click", () => {
    document.getElementById("modalAyuda").style.display = "flex";
  });
}

function cerrarAyuda() {
  document.getElementById("modalAyuda").style.display = "none";
}