
from flask import Flask, render_template_string, jsonify, request
import requests
import threading
import time
from datetime import datetime

# =========================================================
# CONFIG
# =========================================================

BASE_URL = "http://192.168.1.34:82/api/ecsShuttle"

TEMPO_ACTUALIZACION = 5

app = Flask(__name__)

monitorando = False
thread_monitor = None

estado_shuttles = {}

# =========================================================
# HTML
# =========================================================

HTML = """

<!DOCTYPE html>
<html lang="es">

<head>

    <meta charset="UTF-8">
    <title>Monitoreo ECS</title>

    <style>

        body {
            font-family: Arial;
            background: #111;
            color: white;
            margin: 0;
            padding: 20px;
        }

        h1 {
            color: #00d4ff;
        }

        .container {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
        }

        .card {
            background: #1e1e1e;
            border-radius: 10px;
            padding: 20px;
            width: 300px;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
        }

        .online {
            color: #00ff88;
            font-weight: bold;
        }

        .offline {
            color: red;
            font-weight: bold;
        }

        button {

            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            margin-right: 10px;
            cursor: pointer;
            font-size: 16px;
        }

        .start {
            background: #00aa55;
            color: white;
        }

        .stop {
            background: #cc2222;
            color: white;
        }

        .refresh {
            margin-top: 20px;
            color: gray;
        }

    </style>

</head>

<body>

    <h1>🚀 ECS Shuttle Monitor</h1>

    <button class="start" onclick="iniciarMonitor()">
        ▶ Iniciar
    </button>

    <button class="stop" onclick="detenerMonitor()">
        ⏹ Detener
    </button>

    <div class="refresh" id="estadoMonitor"></div>

    <br><br>

    <div class="container" id="cards"></div>

    <script>

        async function cargarDatos() {

            const response = await fetch('/estado');
            const data = await response.json();

            const cards = document.getElementById('cards');

            cards.innerHTML = '';

            for (const shuttle of data) {

                let estadoClass = shuttle.online ? 'online' : 'offline';

                cards.innerHTML += `

                    <div class="card">

                        <h2>🚀 Shuttle ${shuttle.id}</h2>

                        <p><b>📦 Descripción:</b> ${shuttle.descripcion}</p>

                        <p><b>🌐 IP:</b> ${shuttle.ip}</p>

                        <p><b>📡 Estado:</b>
                            <span class="${estadoClass}">
                                ${shuttle.estado}
                            </span>
                        </p>

                        <p><b>🔋 Batería:</b> ${shuttle.bateria}</p>

                        <p><b>🕒 Última actualización:</b><br>
                        ${shuttle.fecha}</p>

                        <p><b>⚠ Mensaje:</b><br>
                        ${shuttle.mensaje}</p>

                    </div>
                `;
            }
        }

        async function iniciarMonitor() {

            await fetch('/start');

            document.getElementById('estadoMonitor').innerHTML =
                '🟢 Monitor iniciado';

        }

        async function detenerMonitor() {

            await fetch('/stop');

            document.getElementById('estadoMonitor').innerHTML =
                '🔴 Monitor detenido';

        }

        setInterval(cargarDatos, 3000);

        cargarDatos();

    </script>

</body>
</html>

"""

# =========================================================
# OBTENER SHUTTLES
# =========================================================

def obtener_shuttles():

    url = f"{BASE_URL}/getShuttleList"

    try:

        response = requests.get(url, timeout=10)

        return response.json().get("data", [])

    except:

        return []

# =========================================================
# OBTENER ESTADO
# =========================================================

def obtener_estado(shuttle_code):

    url = f"{BASE_URL}/getStatus?shuttleCode={shuttle_code}"

    try:

        response = requests.get(url, timeout=10)

        return response.json()

    except Exception as e:

        return {
            "code": -1,
            "msg": str(e),
            "data": None
        }

# =========================================================
# MONITOR
# =========================================================

def monitor_loop():

    global monitorando

    while monitorando:

        shuttles = obtener_shuttles()

        for shuttle in shuttles:

            shuttle_code = shuttle.get("shuttleCode")

            resultado = obtener_estado(shuttle_code)

            online = resultado.get("code") == 0

            bateria = "N/A"
            estado = "OFFLINE"

            if online:

                data = resultado.get("data")

                if data:

                    bateria = data.get("electricity", "N/A")
                    estado = data.get("shuttleStatusText", "ONLINE")

                else:

                    estado = "SIN DATOS"

            estado_shuttles[shuttle_code] = {

                "id": shuttle_code,
                "descripcion": shuttle.get("shuttleDesc"),
                "ip": shuttle.get("shuttleIp"),
                "online": online,
                "estado": estado,
                "bateria": bateria,
                "mensaje": resultado.get("msg"),
                "fecha": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }

        time.sleep(TEMPO_ACTUALIZACION)

# =========================================================
# RUTAS
# =========================================================

@app.route("/")
def home():

    return render_template_string(HTML)

@app.route("/estado")
def estado():

    return jsonify(list(estado_shuttles.values()))

@app.route("/start")
def start():

    global monitorando
    global thread_monitor

    if not monitorando:

        monitorando = True

        thread_monitor = threading.Thread(target=monitor_loop)
        thread_monitor.daemon = True
        thread_monitor.start()

    return jsonify({"status": "monitor iniciado"})

@app.route("/stop")
def stop():

    global monitorando

    monitorando = False

    return jsonify({"status": "monitor detenido"})

# =========================================================
# MAIN
# =========================================================
if __name__ == "__main__":

    print("\n🚀 ECS Monitor iniciado")
    print("🌐 http://127.0.0.1:5000\n")

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )
