/* Extras exclusivos de la DEMO: renueva los datos de ejemplo cada día (los turnos de ejemplo se cargan con fechas relativas a "hoy"),
   da PIN a los empleados y muestra una barra para cambiar de pantalla o reiniciar. Se carga ANTES de core.js.
   Cada demo con su marca usa un prefijo (storageNs en su config.js) para no mezclar sus datos con los de otra en el mismo navegador. */
(function(){
  var NS = (window.BARBERPRO_CONFIG || {}).storageNs || "";
  var TURNOS = "barberpro_turnos_v2" + NS, DAY = "barberpro_demo_day" + NS;
  var hoy = new Date(), iso = hoy.getFullYear() + "-" + (hoy.getMonth() + 1) + "-" + hoy.getDate();
  try{
    if(localStorage.getItem(DAY) !== iso){ localStorage.removeItem(TURNOS); localStorage.setItem(DAY, iso); }
  }catch(e){}

  function reiniciar(){
    try{
      ["barberpro_turnos_v2", "barberpro_accounts_v2", "barberpro_client_profile_v2", "barberpro_owner_authed", "barberpro_intro_seen"].forEach(function(k){
        localStorage.removeItem(k + NS); sessionStorage.removeItem(k + NS);
      });
    }catch(e){}
    location.reload();
  }

  document.addEventListener("DOMContentLoaded", function(){
    var emps = [];
    try{
      emps = (state.config.team || []).filter(function(m){ return m.role === "employee"; });
      if(window.state && state.config && !state.config.staffPins){
        var pins = {}; emps.forEach(function(m, i){ pins[m.id] = String(1111 * (i + 1)); });
        state.config.staffPins = pins; saveState();
      }
    }catch(e){}
    var panel = window.BARBERPRO_PAGE === "admin";
    var pinTxt = "PIN dueño <b>1234</b>" + emps.map(function(m, i){ return " · " + m.name + " <b>" + (1111 * (i + 1)) + "</b>"; }).join("");
    var bar = document.createElement("div");
    bar.className = "demo-bar" + (panel ? " is-panel" : "");
    bar.innerHTML =
      '<span class="demo-tag">DEMO</span>' +
      '<span class="demo-txt">' + (panel ? pinTxt : "Reservá como si fueras un cliente") + '</span>' +
      '<a href="' + (panel ? "app.html" : "panel.html") + '" target="_blank" rel="noopener">' + (panel ? "Ver app del cliente" : "Ver panel del dueño") + '</a>' +
      (panel ? '<button type="button" id="demoTour">Recorrido</button>' : '') +
      '<button type="button" id="demoReset">Reiniciar</button>';
    document.body.appendChild(bar);
    var tb = document.getElementById("demoTour");
    if(tb) tb.onclick = function(){ if(window.BP_openTour) BP_openTour(); };
    document.getElementById("demoReset").onclick = function(){
      if(confirm("¿Reiniciar la demo? Se borra lo que cargaste y vuelven los datos de ejemplo.")) reiniciar();
    };
  });
})();
