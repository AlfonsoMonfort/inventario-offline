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

    document.getElementById("cantidad").addEventListener("focus", function () {
        this.value = "";
    });
});


// ============================
// CARGAR EQUIVALENCIAS
// ============================
async function cargarEquivalencias() {
    let guardado = localStorage.getItem("equivalencias");
    let datos = guardado
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
    let guardado = localStorage.getItem("articulos_sin_codigo");

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
        let opt = document.createElement("option");
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

    const fechaValor = document.getElementById("fecha").value;
    const almacenValor = document.getElementById("almacen").value;
    const vendedorValor = document.getElementById("vendedor").value;

    if (!fechaValor || !almacenValor || !vendedorValor) {
        alert("Completa todos los campos");
        return;
    }

    inventario = {
        fecha: fechaValor,
        almacen: almacenValor,
        vendedor: vendedorValor,
        articulos: {}
    };

    document.getElementById("pantallaInicio").style.display = "none";
    document.getElementById("pantallaEscaner").style.display = "block";

    cargarSelectorSinCodigo();

    // 🔑 iniciar escáner CUANDO la pantalla ya es visible
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
    if (!result || !result.codeResult || !result.codeResult.code) return;

    let code = result.codeResult.code.replace(/\D/g, "");
    if (![8, 12, 13].includes(code.length)) return;

    let ahora = Date.now();
    if (code === ultimoCodigo && ahora - ultimoTiempo < 1500) return;

    ultimoCodigo = code;
    ultimoTiempo = ahora;
    permitirEscaneo = false;

    procesarCodigo(code);
}

function procesarCodigo(codigo) {

    let cant = parseInt(document.getElementById("cantidad").value) || 1;
    let ref = codigo_a_referencia[codigo] ||
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

    let cant = parseInt(document.getElementById("cantidad").value) || 1;

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

    for (let ref in inventario.articulos) {
        let li = document.createElement("li");
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

    let datos = Object.entries(inventario.articulos).map(([ref, cant]) => ({
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

    let wb = XLSX.utils.book_new();
    let ws = XLSX.utils.json_to_sheet(datos);
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
