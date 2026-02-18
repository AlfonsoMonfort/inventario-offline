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

const DEBUG_OCR = true;

let inventario = {
    fecha: "",
    almacen: "",
    vendedor: "",
    articulos: {}
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
                codigo_a_referencia[item.codigo] = item.referencia;
                referencia_a_descripcion[item.referencia] = item.descripcion;
            });

            console.log("Total códigos cargados:", Object.keys(codigo_a_referencia).length);
            return;
        }

        console.log("Descargando equivalencias por primera vez");

        const response = await fetch("equivalencias.json");

        if (!response.ok) {
            throw new Error("No se pudo cargar equivalencias.json");
        }

        const datos = await response.json();

        console.log("Datos recibidos:", datos);

        localStorage.setItem("equivalencias", JSON.stringify(datos));

        datos.forEach(item => {
            codigo_a_referencia[item.codigo] = item.referencia;
            referencia_a_descripcion[item.referencia] = item.descripcion;
        });

        console.log("Total códigos cargados:", Object.keys(codigo_a_referencia).length);

    } catch (error) {
        console.log("Error cargando equivalencias:", error);
    }
}

function esSamsung() {
  return /samsung/i.test(navigator.userAgent);
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
  iniciarScanner();

  mostrarMensaje("↩️ Inventario recuperado", "ok");
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

  Quagga.onDetected(function (result) {
  if (!permitirEscaneo) return;
  if (!result?.codeResult?.code) return;

  const code = result.codeResult.code.replace(/\D/g, "");
  if (![8, 12, 13].includes(code.length)) return;

  permitirEscaneo = false;

  // 🧠 MODO APRENDIZAJE
  if (modoAprendizaje) {
  codigoPendienteAprender = code;

  const divCodigo = document.getElementById("codigoAprendidoMostrado");
  divCodigo.textContent = "Código leído: " + code;
  divCodigo.style.display = "block";

  mostrarMensaje("✅ Código leído", "ok");
  mostrarFormularioAprendizaje();
  return;
}

  // flujo normal
  procesarCodigo(code);
});

}


function activarModoOCR() {
  // 🔒 limpiar restos anteriores
  if (ocrInterval) clearInterval(ocrInterval);
  if (ocrTimeout) clearTimeout(ocrTimeout);

  modoOCR = true;
  modoOCRActivo = true;
  permitirEscaneo = false;

  mostrarMensaje("🔍 Buscando referencia…", "ok");

  // 🔁 OCR continuo
  ocrInterval = setInterval(() => {
    if (!modoOCRActivo) return;
    leerOCRContinuo();
  }, 700);

  // ⏱️ Timeout de seguridad (10 s)
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

  // iOS → compartir
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    window.open(url);
  } else {
    // Android / PC → descarga
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

  if (!modoOCRActivo) return;

  const video = document.querySelector("#scanner video");
  const frame = document.querySelector(".scanner-frame");
  const debugText = document.getElementById("ocrTextDebug");

  if (debugText) {
    debugText.innerText = "OCR activo…";
  }

  if (!video || !frame || !video.videoWidth) return;

  const videoRect = video.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();

  const scaleX = video.videoWidth / videoRect.width;
  const scaleY = video.videoHeight / videoRect.height;

  let sx = (frameRect.left - videoRect.left) * scaleX;
  let sy = (frameRect.top - videoRect.top) * scaleY;
  let sw = frameRect.width * scaleX;
  let sh = frameRect.height * scaleY;

  const recorte = 0.45;
  const dx = sw * (1 - recorte) / 2;
  const dy = sh * (1 - recorte) / 2;

  sx += dx;
  sy += dy;
  sw *= recorte;
  sh *= recorte;

  const canvas = document.createElement("canvas");
  canvas.width = sw * 2;
  canvas.height = sh * 2;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i+1] + data[i+2]) / 3;
    const v = avg > 145 ? 255 : 0;
    data[i] = data[i+1] = data[i+2] = v;
  }

  ctx.putImageData(imgData, 0, 0);

  Tesseract.recognize(
    canvas,
    "eng",
    {
      tessedit_char_whitelist: "0123456789",
      classify_bln_numeric_mode: 1
    }
  ).then(result => {

    const texto = (result.data.text || "").replace(/\s+/g, "");

    if (debugText) {
      debugText.innerText = `OCR lee: "${texto || "∅"}"`;
    }

  }).catch(err => {
    if (debugText) {
      debugText.innerText = "OCR error";
    }
    console.error(err);
  });
}

function aceptarOCR() {
  modoOCR = false;
  document.getElementById("ocrBox").style.display = "none";

  if (!numeroOCRDetectado) return;

  if (!referencia_a_descripcion[numeroOCRDetectado]) {
    mostrarMensaje("❌ Referencia no existe", "error");
    permitirEscaneo = true;
    return;
  }

  const cantidad =
    parseInt(document.getElementById("cantidad").value) || 1;

  inventario.articulos[numeroOCRDetectado] =
    (inventario.articulos[numeroOCRDetectado] || 0) + cantidad;

  actualizarLista();

  numeroOCRDetectado = null;
  permitirEscaneo = true;

  mostrarMensaje("✅ Referencia añadida", "ok");
}

function cancelarOCR() {
  modoOCR = false;
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

  document.getElementById("ocrBox").style.display = "none";
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
  const cantidad = parseInt(document.getElementById("cantidad").value);

  if (!referencia) {
    mostrarMensaje("❌ Selecciona un artículo", "error");
    return;
  }

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