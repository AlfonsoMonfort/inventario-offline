let deferredPrompt = null;

// ============================
// VARIABLES GLOBALES
// ============================
let codigo_a_referencia = {};
let referencia_a_descripcion = {};
let articulosSinCodigo = [];

let inventario = {
    fecha: "",
    almacen: "",
    vendedor: "",
    articulos: {}
};

let permitirEscaneo = false;
let ultimoCodigo = "";
let ultimoTiempo = 0;
let scannerIniciado = false;


// ============================
// INICIO
// ============================
document.addEventListener("DOMContentLoaded", async () => {

    document.getElementById("fecha").value =
        new Date().toISOString().split("T")[0];

    document.getElementById("almacen").addEventListener("input", function () {
        this.value = this.value.toUpperCase();
    });

    await cargarEquivalencias();
    await cargarArticulosSinCodigo();

    registrarServiceWorker();

    // 🔥 EVENTO INSTALACIÓN PWA (IMPRESCINDIBLE)
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferredPrompt = e;
        document.getElementById("btnInstalar").style.display = "block";
    });

    document.getElementById("cantidad").addEventListener("focus", function () {
        this.value = "";
    });
});


// ============================
// INSTALAR APP
// ============================
function instalarApp() {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();

    deferredPrompt.userChoice.finally(() => {
        deferredPrompt = null;
        document.getElementById("btnInstalar").style.display = "none";
    });
}


// ============================
// CARGAR EQUIVALENCIAS
// ============================
async function cargarEquivalencias() {
    const guardado = localStorage.getItem("equivalencias");
    const datos = guardado
        ? JSON.parse(guardado)
        : await (await fetch("equivalencias.json")).json();

    localStorage.setItem("equivalencias", JSON.stringify(datos));

    datos.forEach(i => {
        codigo_a_referencia[i.codigo] = i.referencia;
        referencia_a_descripcion[i.referencia] = i.descripcion;
    });
}


// ============================
// ARTÍCULOS SIN CÓDIGO
// ============================
async function cargarArticulosSinCodigo() {
    const guardado = localStorage.getItem("articulos_sin_codigo");

    if (guardado) {
        articulosSinCodigo = JSON.parse(guardado);
    } else {
        const resp = await fetch("articulos_sin_codigo.json");
        articulosSinCodigo = await resp.json();
        localStorage.setItem(
            "articulos_sin_codigo",
            JSON.stringify(articulosSinCodigo)
        );
    }
}

function cargarSelectorSinCodigo() {
    const sel = document.getElementById("articuloSinCodigo");
    sel.innerHTML = `<option value="">— Selecciona —</option>`;

    articulosSinCodigo.forEach(a => {
        const opt = document.createElement("option");
        opt.value = a.referencia;
        opt.textContent = a.descripcion;
        sel.appendChild(opt);

        referencia_a_descripcion[a.referencia] = a.descripcion;
    });
}


// ============================
// EMPEZAR
// ============================
function empezar() {

    const fecha = document.getElementById("fecha").value;
    const almacen = document.getElementById("almacen").value;
    const vendedor = document.getElementById("vendedor").value;

    if (!fecha || !almacen || !vendedor) {
        alert("Completa todos los campos");
        return;
    }

    inventario = {
        fecha,
        almacen,
        vendedor,
        articulos: {}
    };

    document.getElementById("pantallaInicio").style.display = "none";
    document.getElementById("pantallaEscaner").style.display = "block";

    cargarSelectorSinCodigo();

    if (!scannerIniciado) {
        setTimeout(() => {
            iniciarScanner();
            scannerIniciado = true;
        }, 300);
    }
}


// ============================
// ESCÁNER
// ============================
function iniciarScanner() {

    Quagga.init({
        inputStream: {
            type: "LiveStream",
            target: document.querySelector("#scanner"),
            constraints: { facingMode: "environment" }
        },
        decoder: {
            readers: ["ean_reader", "ean_8_reader", "upc_reader"]
        }
    }, () => Quagga.start());

    document.getElementById("scanner").addEventListener("click", () => {
        permitirEscaneo = true;
    });

    Quagga.onDetected(onDetectado);
}

function onDetectado(result) {

    if (!permitirEscaneo) return;
    if (!result?.codeResult?.code) return;

    const code = result.codeResult.code.replace(/\D/g, "");
    if (![8, 12, 13].includes(code.length)) return;

    const ahora = Date.now();
    if (code === ultimoCodigo && ahora - ultimoTiempo < 1500) return;

    ultimoCodigo = code;
    ultimoTiempo = ahora;
    permitirEscaneo = false;

    procesarCodigo(code);
}

function procesarCodigo(codigo) {

    const cant = parseInt(document.getElementById("cantidad").value) || 1;
    const ref =
        codigo_a_referencia[codigo] ||
        codigo_a_referencia[codigo.slice(1)];

    if (!ref) {
        mostrarMensaje("❌ Código no encontrado", "error");
        return;
    }

    inventario.articulos[ref] =
        (inventario.articulos[ref] || 0) + cant;

    document.getElementById("cantidad").value = 1;

    mostrarMensaje("✅ Artículo añadido", "ok");
    actualizarLista();
}


// ============================
// AÑADIR MANUAL
// ============================
function añadirSinCodigo() {

    const ref = document.getElementById("articuloSinCodigo").value;
    if (!ref) return;

    const cant = parseInt(document.getElementById("cantidad").value) || 1;

    inventario.articulos[ref] =
        (inventario.articulos[ref] || 0) + cant;

    document.getElementById("cantidad").value = 1;
    document.getElementById("articuloSinCodigo").value = "";

    mostrarMensaje("✅ Artículo añadido", "ok");
    actualizarLista();
}


// ============================
// LISTA
// ============================
function actualizarLista() {

    const lista = document.getElementById("listaArticulos");
    lista.innerHTML = "";

    for (const ref in inventario.articulos) {
        const li = document.createElement("li");
        li.innerHTML = `
            <b>${referencia_a_descripcion[ref] || ref}</b><br>
            Ref: ${ref} — Cantidad: ${inventario.articulos[ref]}
        `;
        lista.appendChild(li);
    }
}


// ============================
// MENSAJES
// ============================
function mostrarMensaje(texto, tipo) {
    const msg = document.getElementById("mensajeEstado");

    msg.className = "mensaje " + tipo;
    msg.textContent = texto;
    msg.style.display = "block";

    document.getElementById(
        tipo === "ok" ? "okSound" : "errorSound"
    ).play();

    setTimeout(() => msg.style.display = "none", 1000);
}


// ============================
// FINALIZAR
// ============================
function finalizar() {

    const datos = Object.entries(inventario.articulos).map(([ref, cant]) => ({
        fecha: inventario.fecha,
        almacen: inventario.almacen,
        referencia: ref,
        cantidad: cant,
        numero_vendedor: inventario.vendedor
    }));

    if (!datos.length) {
        alert("No hay artículos");
        return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datos);
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");

    XLSX.writeFile(wb, "inventario.xlsx");
    location.reload();
}


// ============================
// AYUDA + SERVICE WORKER
// ============================
function abrirAyuda() {
    document.getElementById("modalAyuda").style.display = "flex";
}

function cerrarAyuda() {
    document.getElementById("modalAyuda").style.display = "none";
}

function registrarServiceWorker() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("service-worker.js");
    }
}

