from flask import Flask, render_template_string, jsonify
import requests
import threading
import time
import random
from datetime import datetime

# =========================================================
# CONFIG
# =========================================================

BASE_URL = "http://192.168.1.34:82/api/ecsShuttle"

TEMPO_ACTUALIZACION = 5

# CAMBIAR PUERTO PARA NO PISAR app_real.py
PORT = 5001

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

    <title>
        SIMULACION ECS Shuttle Monitor
    </title>

    <style>

        body {

            font-family: Arial;
            background: #0f172a;
            color: white;
            margin: 0;
            padding: 20px;
        }

        h1 {

            color: #38bdf8;
            margin-bottom: 10px;
        }

        .topbar {

            margin-bottom: 25px;
        }

        button {

            padding: 12px 22px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 15px;
            margin-right: 10px;
            font-weight: bold;
        }

        .start {

            background: #16a34a;
            color: white;
        }

        .stop {

            background: #dc2626;
            color: white;
        }

        .container {

            display: flex;
            flex-wrap: wrap;
            gap: 20px;
        }

        .card {

            width: 360px;
            background: #1e293b;
            border-radius: 15px;
            padding: 20px;
            box-shadow: 0px 0px 15px rgba(0,0,0,0.4);
            border: 1px solid #334155;
        }

        .online {

            color: #22c55e;
            font-weight: bold;
        }

        .offline {

            color: #ef4444;
            font-weight: bold;
        }

        .battery {

            height: 25px;
            width: 100%;
            background: #334155;
            border-radius: 8px;
            overflow: hidden;
            margin-top: 8px;
        }

        .battery-fill {

            height: 100%;
            text-align: center;
            line-height: 25px;
            font-weight: bold;
            color: white;
        }

        .ok {

            background: #22c55e;
        }

        .medium {

            background: #eab308;
        }

        .low {

            background: #ef4444;
        }

        .dato {

            margin-top: 10px;
            font-size: 15px;
        }

        .titulo {

            font-size: 22px;
            margin-bottom: 15px;
            color: #38bdf8;
        }

        .estado-monitor {

            margin-top: 10px;
            color: #cbd5e1;
        }

        .header-info {

            background: #1e293b;
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 20px;
        }

    </style>

</head>

<body>

    <div class="header-info">

        <h1>
            🚀 SIMULACION ECS Shuttle Monitor
        </h1>

        <div>
            Visualización DEMO de cómo podría verse el monitoreo
            real una vez establecida la comunicación entre ECS
            y los shuttles.
        </div>

        <br>

        <button class="start" onclick="iniciarMonitor()">
            ▶ Iniciar Simulación
        </button>

        <button class="stop" onclick="detenerMonitor()">
            ⏹ Detener Simulación
        </button>

        <div class="estado-monitor" id="estadoMonitor">
            🔴 Simulación detenida
        </div>

    </div>

    <div class="container" id="cards"></div>

<script>

async function cargarDatos() {

    const response = await fetch('/estado');

    const data = await response.json();

    const cards = document.getElementById('cards');

    cards.innerHTML = '';

    for (const shuttle of data) {

        let estadoClass = shuttle.online ? 'online' : 'offline';

        let batteryClass = 'ok';

        if (shuttle.bateria < 60)
            batteryClass = 'medium';

        if (shuttle.bateria < 30)
            batteryClass = 'low';

        cards.innerHTML += `

        <div class="card">

            <div class="titulo">
                🚀 Shuttle ${shuttle.id}
            </div>

            <div class="dato">
                <b>📦 Descripción:</b>
                ${shuttle.descripcion}
            </div>

            <div class="dato">
                <b>🌐 IP:</b>
                ${shuttle.ip}
            </div>

            <div class="dato">
                <b>📡 Estado:</b>
                <span class="${estadoClass}">
                    ${shuttle.estado}
                </span>
            </div>

            <div class="dato">
                <b>🔋 Batería:</b>
            </div>

            <div class="battery">

                <div class="battery-fill ${batteryClass}"
                    style="width:${shuttle.bateria}%">

                    ${shuttle.bateria}%

                </div>

            </div>

            <div class="dato">
                <b>📍 Posición:</b>
                X:${shuttle.pos_x}
                |
                Y:${shuttle.pos_y}
            </div>

            <div class="dato">
                <b>📦 Pallet:</b>
                ${shuttle.pallet}
            </div>

            <div class="dato">
                <b>⚙ Modo:</b>
                ${shuttle.modo}
            </div>

            <div class="dato">
                <b>🧭 Destino:</b>
                ${shuttle.destino}
            </div>

            <div class="dato">
                <b>🚦 Velocidad:</b>
                ${shuttle.velocidad} m/s
            </div>

            <div class="dato">
                <b>🔄 Ciclos:</b>
                ${shuttle.ciclos}
            </div>

            <div class="dato">
                <b>⚠ Alarmas:</b>
                ${shuttle.alarma}
            </div>

            <div class="dato">
                <b>🕒 Última actualización:</b><br>
                ${shuttle.fecha}
            </div>

            <div class="dato">
                <b>📝 Mensaje ECS:</b><br>
                ${shuttle.mensaje}
            </div>

        </div>

        `;
    }
}

async function iniciarMonitor() {

    await fetch('/start');

    document.getElementById('estadoMonitor').innerHTML =
        '🟢 Simulación iniciada';
}

async function detenerMonitor() {

    await fetch('/stop');

    document.getElementById('estadoMonitor').innerHTML =
        '🔴 Simulación detenida';
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

    try:

        url = f"{BASE_URL}/getShuttleList"

        response = requests.get(url, timeout=5)

        data = response.json().get("data", [])

        if data:
            return data

    except:
        pass

    # -----------------------------------------------------
    # SIMULACION
    # -----------------------------------------------------

    return [

        {
            "shuttleCode": 1,
            "shuttleDesc": "SC210-1",
            "shuttleIp": "192.168.10.101"
        },

        {
            "shuttleCode": 2,
            "shuttleDesc": "SC210-2",
            "shuttleIp": "192.168.10.102"
        }
    ]

# =========================================================
# ESTADO SIMULADO
# =========================================================

def obtener_estado(shuttle_code):

    bateria = random.randint(20, 100)

    estados = [
        "RUNNING",
        "IDLE",
        "CHARGING",
        "MOVING"
    ]

    alarmas = [
        "NINGUNA",
        "BATERIA BAJA",
        "OBSTACULO",
        "SIN ALARMAS"
    ]

    pallets = [
        "PALLET-001",
        "PALLET-020",
        "PALLET-155",
        "VACIO"
    ]

    destinos = [
        "RACK-A1",
        "RACK-B4",
        "RACK-C2",
        "CHARGER"
    ]

    modos = [
        "AUTO",
        "MANUAL"
    ]

    return {

        "code": 0,

        "msg": "SIMULACION ACTIVA",

        "data": {

            "electricity": bateria,

            "shuttleStatusText":
                random.choice(estados),

            "pos_x":
                random.randint(1, 120),

            "pos_y":
                random.randint(1, 50),

            "pallet":
                random.choice(pallets),

            "modo":
                random.choice(modos),

            "destino":
                random.choice(destinos),

            "velocidad":
                round(random.uniform(0.2, 1.5), 2),

            "ciclos":
                random.randint(100, 5000),

            "alarma":
                random.choice(alarmas)
        }
    }

# =========================================================
# LOOP MONITOR
# =========================================================

def monitor_loop():

    global monitorando

    while monitorando:

        shuttles = obtener_shuttles()

        for shuttle in shuttles:

            shuttle_code = shuttle.get("shuttleCode")

            resultado = obtener_estado(shuttle_code)

            data = resultado.get("data", {})

            estado_shuttles[shuttle_code] = {

                "id":
                    shuttle_code,

                "descripcion":
                    shuttle.get("shuttleDesc"),

                "ip":
                    shuttle.get("shuttleIp"),

                "online":
                    True,

                "estado":
                    data.get(
                        "shuttleStatusText",
                        "OFFLINE"
                    ),

                "bateria":
                    data.get(
                        "electricity",
                        0
                    ),

                "pos_x":
                    data.get(
                        "pos_x",
                        0
                    ),

                "pos_y":
                    data.get(
                        "pos_y",
                        0
                    ),

                "pallet":
                    data.get(
                        "pallet",
                        "N/A"
                    ),

                "modo":
                    data.get(
                        "modo",
                        "N/A"
                    ),

                "destino":
                    data.get(
                        "destino",
                        "N/A"
                    ),

                "velocidad":
                    data.get(
                        "velocidad",
                        0
                    ),

                "ciclos":
                    data.get(
                        "ciclos",
                        0
                    ),

                "alarma":
                    data.get(
                        "alarma",
                        "NINGUNA"
                    ),

                "mensaje":
                    resultado.get("msg"),

                "fecha":
                    datetime.now().strftime(
                        "%Y-%m-%d %H:%M:%S"
                    )
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

        thread_monitor = threading.Thread(
            target=monitor_loop
        )

        thread_monitor.daemon = True

        thread_monitor.start()

    return jsonify({
        "status": "monitor iniciado"
    })

@app.route("/stop")
def stop():

    global monitorando

    monitorando = False

    return jsonify({
        "status": "monitor detenido"
    })

# =========================================================
# MAIN
# =========================================================

if __name__ == "__main__":

    print("\n🚀 SIMULACION ECS Monitor iniciada")
    print(f"🌐 http://127.0.0.1:{PORT}\n")

    app.run(
        host="0.0.0.0",
        port=PORT,
        debug=True
    )