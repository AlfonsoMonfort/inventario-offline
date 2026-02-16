// ============================
// VARIABLES GLOBALES
// ============================
let codigo_a_referencia = {};
let referencia_a_descripcion = {};

let inventario = {
    fecha: "",
    almacen: "",
    vendedor: "",
    articulos: {}
};

let permitirEscaneo = false;
let ultimoCodigo = "";
let ultimoTiempo = 0;


// ============================
// INICIO
// ============================
document.addEventListener("DOMContentLoaded", async () => {

    document.getElementById("fecha").value =
        new Date().toISOString().split("T")[0];

    // FORZAR MAYÚSCULAS EN ALMACÉN
    const almacenInput = document.getElementById("almacen");
    almacenInput.addEventListener("input", function () {
        this.value = this.value.toUpperCase();
    });

    await cargarEquivalencias();
    iniciarScanner();
    registrarServiceWorker();

    const cantidadInput = document.getElementById("cantidad");
    cantidadInput.addEventListener("focus", function () {
        this.value = "";
    });
});


// ============================
// CARGAR EQUIVALENCIAS
// ============================
async function cargarEquivalencias() {
    try {
        let guardado = localStorage.getItem("equivalencias");

        if (guardado) {
            let datos = JSON.parse(guardado);
            datos.forEach(i => {
                codigo_a_referencia[i.codigo] = i.referencia;
                referencia_a_descripcion[i.referencia] = i.descripcion;
            });
            return;
        }

        const res = await fetch("equivalencias.json");
        if (!res.ok) throw new Error("No se pudo cargar equivalencias");

        const datos = await res.json();
        localStorage.setItem("equivalencias", JSON.stringify(datos));

        datos.forEach(i => {
            codigo_a_referencia[i.codigo] = i.referencia;
            referencia_a_descripcion[i.referencia] = i.descripcion;
        });

    } catch (e) {
        console.error("Error equivalencias:", e);
        alert("Error cargando equivalencias");
    }
}


// ============================
// EMPEZAR INVENTARIO
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
}


// ============================
// INICIAR ESCÁNER
// ============================
function iniciarScanner() {

    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector("#scanner"),
            constraints: { facingMode: "environment" },
            area: {
                top: "20%",
                right: "5%",
                left: "5%",
                bottom: "20%"
            }
        },
        locator: {
            patchSize: "medium",
            halfSample: false
        },
        decoder: {
            readers: [
                "ean_reader",
                "ean_8_reader",
                "upc_reader"
            ]
        },
        locate: false
    }, err => {
        if (err) {
            console.error(err);
            return;
        }
        Quagga.start();
    });

    document.getElementById("scanner").addEventListener("click", () => {
        permitirEscaneo = true;
    });

    Quagga.onDetected(onDetectado);
}


// ============================
// DETECCIÓN ROBUSTA
// ============================
function onDetectado(result) {

    if (!permitirEscaneo) return;
    if (!result?.codeResult?.code) return;

    let ahora = Date.now();
    let code = result.codeResult.code;

    // Limpia basura: >, espacios, etc.
    code = code.replace(/\D/g, "");

    // Normaliza UPC-A incompleto
    if (code.length === 11) code = "0" + code;

    // Longitudes válidas
    if (![8, 12, 13].includes(code.length)) return;

    // Evitar doble lectura del mismo código
    if (code === ultimoCodigo && ahora - ultimoTiempo < 1500) return;

    ultimoCodigo = code;
    ultimoTiempo = ahora;
    permitirEscaneo = false;

    procesarCodigo(code);
}


// ============================
// PROCESAR CÓDIGO
// ============================
function procesarCodigo(codigo) {

    let cantidad = parseInt(document.getElementById("cantidad").value) || 1;

    let referencia = codigo_a_referencia[codigo];

    // Compatibilidad EAN13 <-> UPC
    if (!referencia && codigo.length === 13 && codigo.startsWith("0")) {
        referencia = codigo_a_referencia[codigo.slice(1)];
    }

    if (!referencia) {
        mostrarMensaje("❌ Código no encontrado", "error");
        return;
    }

    inventario.articulos[referencia] =
        (inventario.articulos[referencia] || 0) + cantidad;

    document.getElementById("cantidad").value = 1;

    mostrarMensaje("✅ Artículo añadido", "ok");
    actualizarLista();
}


// ============================
// ACTUALIZAR LISTA
// ============================
function actualizarLista() {

    let ul = document.getElementById("listaArticulos");
    ul.innerHTML = "";

    for (let ref in inventario.articulos) {
        let li = document.createElement("li");
        li.innerHTML = `
            <b>${referencia_a_descripcion[ref] || "Artículo"}</b><br>
            Ref: ${ref} — Cantidad: ${inventario.articulos[ref]}
        `;
        ul.appendChild(li);
    }
}


// ============================
// MENSAJES
// ============================
function mostrarMensaje(texto, tipo) {

    let m = document.getElementById("mensajeEstado");
    m.className = "mensaje " + tipo;
    m.innerHTML = texto;
    m.style.display = "block";

    let s = document.getElementById(tipo === "ok" ? "okSound" : "errorSound");
    if (s) {
        s.currentTime = 0;
        s.play();
    }

    setTimeout(() => m.style.display = "none", 1000);
}


// ============================
// FORMATO FECHA / HORA
// ============================
function formatearFecha(f) {
    const [a, m, d] = f.split("-");
    return `${d}/${m}/${a}`;
}

function formatearHoraMinuto() {
    const t = new Date();
    return `${String(t.getHours()).padStart(2, "0")}${String(t.getMinutes()).padStart(2, "0")}`;
}


// ============================
// GENERAR EXCEL
// ============================
function finalizar() {

    let datos = Object.entries(inventario.articulos).map(([ref, cant]) => ({
        fecha: formatearFecha(inventario.fecha),
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

    let nombre =
        `inventario.${inventario.almacen}.${formatearFecha(inventario.fecha)}.${formatearHoraMinuto()}.xlsx`;

    XLSX.writeFile(wb, nombre);
    location.reload();
}


// ============================
// SERVICE WORKER
// ============================
function registrarServiceWorker() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("service-worker.js")
            .catch(e => console.log("SW error:", e));
    }
}
