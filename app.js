let inventario = {};

// Cargar inventario guardado
function cargarLocal() {
    let data = localStorage.getItem("inventario");
    if (data) {
        inventario = JSON.parse(data);
        actualizarLista();
    }
}

// Guardar inventario
function guardarLocal() {
    localStorage.setItem("inventario", JSON.stringify(inventario));
}

// Actualizar lista en pantalla
function actualizarLista() {
    let ul = document.getElementById("lista");
    ul.innerHTML = "";

    for (let ref in inventario) {
        let li = document.createElement("li");
        li.innerText = ref + " - Cantidad: " + inventario[ref];
        ul.appendChild(li);
    }
}

// Iniciar cámara
Quagga.init({
    inputStream: {
        type: "LiveStream",
        target: document.querySelector('#scanner'),
        constraints: { facingMode: "environment" }
    },
    decoder: {
        readers: ["ean_reader"]
    }
}, function(err) {
    if (!err) {
        Quagga.start();
    }
});

// Detectar código
Quagga.onDetected(function(result) {

    let code = result.codeResult.code;

    if (!/^\d{13}$/.test(code)) return;

    let cantidad = parseInt(document.getElementById("cantidad").value);

    if (inventario[code]) {
        inventario[code] += cantidad;
    } else {
        inventario[code] = cantidad;
    }

    guardarLocal();
    actualizarLista();
});

// Generar Excel
function generarExcel() {

    let ws_data = [["Codigo", "Cantidad"]];

    for (let ref in inventario) {
        ws_data.push([ref, inventario[ref]]);
    }

    let wb = XLSX.utils.book_new();
    let ws = XLSX.utils.aoa_to_sheet(ws_data);
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");

    XLSX.writeFile(wb, "inventario.xlsx");
}

cargarLocal();

// Registrar Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/service-worker.js')
            .then(function(registration) {
                console.log('Service Worker registrado correctamente:', registration.scope);
            })
            .catch(function(error) {
                console.log('Error registrando Service Worker:', error);
            });
    });
}