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
});


// ----------------------------
// CARGAR EXCEL EQUIVALENCIAS
// ----------------------------
async function cargarEquivalencias() {

    const response = await fetch("equivalencias.xlsx");
    const data = await response.arrayBuffer();

    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    for (let i = 1; i < rows.length; i++) {

        let descripcion = rows[i][0];
        let codigo = rows[i][1];
        let referencia = rows[i][2];

        if (codigo && referencia) {
            codigo_a_referencia[String(codigo)] = String(referencia);
            referencia_a_descripcion[String(referencia)] = descripcion;
        }
    }

    console.log("Equivalencias cargadas");
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

    Quagga.onDetected(function (result) {

        if (!permitirEscaneo) return;

        let code = result.codeResult.code;

        if (!/^\d{13}$/.test(code)) return;

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
            navigator.serviceWorker.register('/service-worker.js')
                .then(function (registration) {
                    console.log('Service Worker registrado:', registration.scope);
                })
                .catch(function (error) {
                    console.log('Error registrando Service Worker:', error);
                });
        });
    }
}