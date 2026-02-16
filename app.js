let deferredPrompt = null;

let productos = [];
let inventario = [];

let permitirEscaneo = true;

// =======================
// PWA INSTALL
// =======================
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const btn = document.getElementById("btnInstalar");
    if (btn) btn.style.display = "block";
});

function instalarApp() {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => {
        deferredPrompt = null;
        const btn = document.getElementById("btnInstalar");
        if (btn) btn.style.display = "none";
    });
}

// =======================
// LOAD JSON
// =======================
fetch("referencias_sin_codigo_barras.json")
    .then(res => res.json())
    .then(data => {
        productos = data;
        construirListaSinCodigo();
    });

// =======================
// LISTA SIN CÓDIGO
// =======================
function construirListaSinCodigo() {
    const contenedor = document.getElementById("lista-sin-codigo");
    if (!contenedor) return;

    contenedor.innerHTML = "";

    productos.forEach(prod => {
        const btn = document.createElement("button");
        btn.textContent = prod.descripcion;
        btn.className = "btn-articulo";

        btn.onclick = () => {
            const cantidad = parseInt(document.getElementById("unidades").value) || 1;
            añadirInventario(prod.descripcion, prod.referencia, cantidad);
        };

        contenedor.appendChild(btn);
    });
}

// =======================
// ESCÁNER
// =======================
function iniciarEscaner() {
    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector("#camera"),
            constraints: {
                facingMode: "environment"
            }
        },
        decoder: {
            readers: [
                "ean_reader",
                "ean_8_reader",
                "upc_reader"
            ]
        }
    }, err => {
        if (err) {
            console.error(err);
            return;
        }
        Quagga.start();
    });

    Quagga.onDetected(onDetectado);
}

function onDetectado(result) {
    if (!permitirEscaneo) return;
    if (!result || !result.codeResult || !result.codeResult.code) return;

    let codigo = result.codeResult.code.replace(/\D/g, "");
    if (![8, 12, 13].includes(codigo.length)) return;

    permitirEscaneo = false;

    const cantidad = parseInt(document.getElementById("unidades").value) || 1;

    añadirInventario("ARTÍCULO CON CÓDIGO", codigo, cantidad);

    setTimeout(() => permitirEscaneo = true, 1500);
}

// =======================
// INVENTARIO
// =======================
function añadirInventario(descripcion, referencia, cantidad) {
    const existente = inventario.find(i => i.referencia === referencia);

    if (existente) {
        existente.cantidad += cantidad;
    } else {
        inventario.push({
            descripcion,
            referencia,
            cantidad
        });
    }

    renderInventario();
}

function renderInventario() {
    const lista = document.getElementById("listaInventario");
    if (!lista) return;

    lista.innerHTML = "";

    inventario.forEach(item => {
        const li = document.createElement("li");
        li.textContent = `${item.descripcion} – ${item.cantidad}`;
        lista.appendChild(li);
    });
}

// =======================
// EXPORT
// =======================
function descargarInventario() {
    let csv = "Descripcion,Referencia,Cantidad\n";

    inventario.forEach(i => {
        csv += `"${i.descripcion}","${i.referencia}",${i.cantidad}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "inventario.csv";
    a.click();

    URL.revokeObjectURL(url);
}
