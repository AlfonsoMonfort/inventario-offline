// ----------------------------
// VARIABLES GLOBALES
// ----------------------------
let codigo_a_referencia = {};
let referencia_a_descripcion = {};

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


    await cargarEquivalencias();
    iniciarScanner();
    registrarServiceWorker();

    const cantidadInput = document.getElementById("cantidad");

    cantidadInput.addEventListener("focus", function () {
        this.value = "";
});
});


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

    document.getElementById("pantallaInicio").style.display = "none";
    document.getElementById("pantallaEscaner").style.display = "block";
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
            constraints: { facingMode: "environment" }
        },
        decoder: { readers: ["ean_reader"] },
        locate: true
    }, function (err) {
        if (!err) {
            Quagga.start();
        }
    });

    document.getElementById("scanner")
        .addEventListener("click", () => permitirEscaneo = true);

    Quagga.onDetected(function(result) {

    let code = result.codeResult.code;

    if (!/^\d{13}$/.test(code)) return;

    if (!permitirEscaneo) return;

    permitirEscaneo = false;

    procesarCodigo(code);
});
}


// ----------------------------
// PROCESAR CÓDIGO
// ----------------------------
function procesarCodigo(codigo) {

    let cantidad = parseInt(document.getElementById("cantidad").value);

    let referencia = codigo_a_referencia[codigo];

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

// ----------------------------
// FINALIZAR Y GENERAR EXCEL
// ----------------------------
function finalizar() {

    let datos = [];

    for (let ref in inventario.articulos) {

        datos.push({
            fecha: inventario.fecha,
            almacen: inventario.almacen,
            referencia: ref,
            cantidad: inventario.articulos[ref],
            numero_vendedor: inventario.vendedor,
            descripcion: referencia_a_descripcion[ref] || ""
        });
    }

    let wb = XLSX.utils.book_new();
    let ws = XLSX.utils.json_to_sheet(datos);
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");

    let nombre = `inventario.${inventario.almacen}.${inventario.fecha}.xlsx`;

    XLSX.writeFile(wb, nombre);

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

function estaEnModoStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
}

if (esIOS() && !estaEnModoStandalone()) {
  const aviso = document.createElement("div");
  aviso.style.position = "fixed";
  aviso.style.bottom = "0";
  aviso.style.left = "0";
  aviso.style.right = "0";
  aviso.style.background = "#000";
  aviso.style.color = "#fff";
  aviso.style.padding = "15px";
  aviso.style.textAlign = "center";
  aviso.style.zIndex = "9999";
  aviso.innerHTML = `
    Para instalar esta app en iPhone:<br>
    1️⃣ Pulsa el botón Compartir<br>
    2️⃣ Elige "Añadir a pantalla de inicio"
  `;
  document.body.appendChild(aviso);
}