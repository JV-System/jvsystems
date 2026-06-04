from flask import Flask, render_template_string, jsonify, request
import threading
import time
import random
from datetime import datetime

# =========================================================
# CONFIG
# =========================================================

PORT = 5002
REFRESH_TIME = 2

app = Flask(__name__)

monitor_running = False
monitor_thread = None

shuttles = {}

# =========================================================
# HTML INDUSTRIAL PLC STYLE
# =========================================================

HTML = """

<!DOCTYPE html>
<html lang="es">

<head>

<meta charset="UTF-8">

<title>
PLC Shuttle HMI
</title>

<style>

body {

    margin: 0;
    background: #c7c7c7;
    font-family: Arial;
}

.header {

    background: #1f2937;
    color: white;
    padding: 15px;
    border-bottom: 4px solid #0ea5e9;
}

.header h1 {

    margin: 0;
    font-size: 28px;
}

.header-info {

    margin-top: 8px;
    color: #cbd5e1;
}

.main {

    padding: 20px;
}

.panel {

    background: #d6d6d6;
    border: 3px solid #666;
    padding: 15px;
    margin-bottom: 20px;
    box-shadow: inset 0px 0px 4px #999;
}

.panel-title {

    background: #374151;
    color: white;
    padding: 10px;
    font-weight: bold;
    margin-bottom: 15px;
}

.grid {

    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(430px, 1fr));
    gap: 20px;
}

.card {

    background: #ececec;
    border: 3px solid #666;
    padding: 15px;
}

.row {

    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
}

.label {

    font-weight: bold;
}

.value {

    background: black;
    color: #00ff00;
    padding: 4px 10px;
    min-width: 120px;
    text-align: center;
    font-family: Consolas;
}

.status-running {

    color: #00ff00;
}

.status-stop {

    color: red;
}

.status-charge {

    color: yellow;
}

.battery-container {

    width: 100%;
    height: 28px;
    background: #222;
    border: 2px solid #555;
    margin-top: 5px;
}

.battery-fill {

    height: 100%;
    text-align: center;
    line-height: 28px;
    color: black;
    font-weight: bold;
}

.green {

    background: #00ff00;
}

.yellow {

    background: yellow;
}

.red {

    background: red;
}

.controls {

    margin-top: 20px;
}

button {

    width: 100px;
    height: 45px;
    margin: 5px;
    border: 2px solid #444;
    font-weight: bold;
    cursor: pointer;
}

.btn-start {

    background: #16a34a;
    color: white;
}

.btn-stop {

    background: #dc2626;
    color: white;
}

.btn-move {

    background: #2563eb;
    color: white;
}

.btn-load {

    background: #9333ea;
    color: white;
}

.btn-reset {

    background: #475569;
    color: white;
}

.log {

    margin-top: 15px;
    background: black;
    color: #00ff00;
    padding: 10px;
    font-family: Consolas;
    height: 90px;
    overflow-y: auto;
    border: 2px solid #444;
}

.top-controls {

    margin-bottom: 20px;
}

.big-button {

    width: 180px;
    height: 60px;
    font-size: 18px;
}

.footer {

    margin-top: 20px;
    background: #1f2937;
    color: white;
    padding: 10px;
}

</style>

</head>

<body>

<div class="header">

    <h1>
        ECS - SHUTTLE HMI PANEL
    </h1>

    <div class="header-info">

        Estado general del sistema de carros automáticos

    </div>

</div>

<div class="main">

    <div class="panel">

        <div class="panel-title">

            CONTROL GENERAL

        </div>

        <div class="top-controls">

            <button class="btn-start big-button"
                onclick="startMonitor()">

                START SYSTEM

            </button>

            <button class="btn-stop big-button"
                onclick="stopMonitor()">

                STOP SYSTEM

            </button>

        </div>

        <div id="systemStatus">

            SYSTEM STOPPED

        </div>

    </div>

    <div class="grid" id="cards"></div>

</div>

<div class="footer">

    ECS CONTROL SYSTEM v2.0 | PLC WEB HMI DEMO

</div>

<script>

async function loadData() {

    const response = await fetch('/estado');

    const data = await response.json();

    const cards = document.getElementById('cards');

    cards.innerHTML = '';

    for (const shuttle of data) {

        let batteryColor = 'green';

        if (shuttle.battery < 60)
            batteryColor = 'yellow';

        if (shuttle.battery < 30)
            batteryColor = 'red';

        cards.innerHTML += `

        <div class="card">

            <div class="panel-title">

                SHUTTLE ${shuttle.id}

            </div>

            <div class="row">

                <div class="label">
                    STATUS
                </div>

                <div class="value">
                    ${shuttle.status}
                </div>

            </div>

            <div class="row">

                <div class="label">
                    POSITION
                </div>

                <div class="value">
                    X:${shuttle.x} Y:${shuttle.y}
                </div>

            </div>

            <div class="row">

                <div class="label">
                    SPEED
                </div>

                <div class="value">
                    ${shuttle.speed} m/s
                </div>

            </div>

            <div class="row">

                <div class="label">
                    PALLET
                </div>

                <div class="value">
                    ${shuttle.pallet}
                </div>

            </div>

            <div class="row">

                <div class="label">
                    DESTINATION
                </div>

                <div class="value">
                    ${shuttle.destination}
                </div>

            </div>

            <div class="row">

                <div class="label">
                    BATTERY
                </div>

            </div>

            <div class="battery-container">

                <div class="battery-fill ${batteryColor}"
                    style="width:${shuttle.battery}%">

                    ${shuttle.battery}%

                </div>

            </div>

            <div class="row" style="margin-top:15px;">

                <div class="label">
                    ALARM
                </div>

                <div class="value">
                    ${shuttle.alarm}
                </div>

            </div>

            <div class="controls">

                <button class="btn-start"
                    onclick="sendAction(${shuttle.id}, 'START')">

                    START

                </button>

                <button class="btn-stop"
                    onclick="sendAction(${shuttle.id}, 'STOP')">

                    STOP

                </button>

                <button class="btn-move"
                    onclick="sendAction(${shuttle.id}, 'MOVE')">

                    MOVE

                </button>

                <button class="btn-load"
                    onclick="sendAction(${shuttle.id}, 'LOAD')">

                    LOAD

                </button>

                <button class="btn-reset"
                    onclick="sendAction(${shuttle.id}, 'RESET')">

                    RESET

                </button>

            </div>

            <div class="log">

                ${shuttle.log}

            </div>

        </div>

        `;
    }
}

async function startMonitor() {

    await fetch('/start');

    document.getElementById('systemStatus').innerHTML =
        '🟢 SYSTEM RUNNING';
}

async function stopMonitor() {

    await fetch('/stop');

    document.getElementById('systemStatus').innerHTML =
        '🔴 SYSTEM STOPPED';
}

async function sendAction(id, action) {

    await fetch('/action', {

        method: 'POST',

        headers: {
            'Content-Type': 'application/json'
        },

        body: JSON.stringify({
            shuttle: id,
            action: action
        })
    });
}

setInterval(loadData, 1500);

loadData();

</script>

</body>
</html>

"""

# =========================================================
# SHUTTLES
# =========================================================

def get_shuttles():

    return [

        {
            "id": 1,
            "desc": "SC210-1",
            "ip": "192.168.10.101"
        },

        {
            "id": 2,
            "desc": "SC210-2",
            "ip": "192.168.10.102"
        }
    ]

# =========================================================
# GENERATE STATUS
# =========================================================

def generate_status(shuttle):

    shuttle["status"] = random.choice([
        "RUNNING",
        "IDLE",
        "MOVING",
        "CHARGING"
    ])

    shuttle["battery"] = random.randint(20, 100)

    shuttle["x"] = random.randint(1, 120)

    shuttle["y"] = random.randint(1, 40)

    shuttle["speed"] = round(
        random.uniform(0.2, 1.5), 2
    )

    shuttle["pallet"] = random.choice([
        "PALLET-001",
        "PALLET-020",
        "EMPTY"
    ])

    shuttle["destination"] = random.choice([
        "RACK-A1",
        "RACK-B5",
        "CHARGER"
    ])

    shuttle["alarm"] = random.choice([
        "NONE",
        "LOW BATTERY",
        "OBSTACLE",
        "OK"
    ])

# =========================================================
# MONITOR LOOP
# =========================================================

def monitor_loop():

    global monitor_running

    while monitor_running:

        data = get_shuttles()

        for item in data:

            sid = item["id"]

            if sid not in shuttles:

                shuttles[sid] = {

                    "id": sid,
                    "log": "SYSTEM INITIALIZED"
                }

            generate_status(shuttles[sid])

        time.sleep(REFRESH_TIME)

# =========================================================
# ROUTES
# =========================================================

@app.route("/")
def home():

    return render_template_string(HTML)

@app.route("/estado")
def estado():

    return jsonify(
        list(shuttles.values())
    )

@app.route("/start")
def start():

    global monitor_running
    global monitor_thread

    if not monitor_running:

        monitor_running = True

        monitor_thread = threading.Thread(
            target=monitor_loop
        )

        monitor_thread.daemon = True
        monitor_thread.start()

    return jsonify({
        "status": "running"
    })

@app.route("/stop")
def stop():

    global monitor_running

    monitor_running = False

    return jsonify({
        "status": "stopped"
    })

@app.route("/action", methods=["POST"])
def action():

    data = request.json

    sid = data["shuttle"]

    action = data["action"]

    log = f"""

[{datetime.now().strftime('%H:%M:%S')}]

ACTION:
{action}

STATUS:
COMMAND SENT

"""

    if sid in shuttles:

        shuttles[sid]["log"] = log

        if action == "STOP":

            shuttles[sid]["status"] = "STOPPED"

            shuttles[sid]["speed"] = 0

        elif action == "MOVE":

            shuttles[sid]["status"] = "MOVING"

        elif action == "LOAD":

            shuttles[sid]["pallet"] = "PALLET-999"

        elif action == "RESET":

            shuttles[sid]["alarm"] = "NONE"

        elif action == "START":

            shuttles[sid]["status"] = "RUNNING"

    return jsonify({
        "ok": True
    })

# =========================================================
# MAIN
# =========================================================

if __name__ == "__main__":

    print("\n🚀 PLC WEB HMI")
    print(f"🌐 http://127.0.0.1:{PORT}\n")

    app.run(
        host="0.0.0.0",
        port=PORT,
        debug=True
    )