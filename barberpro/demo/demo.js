/* Extras exclusivos de la DEMO: renueva los datos de ejemplo cada día (los turnos de ejemplo se cargan con fechas relativas a "hoy"),
   da PIN a los empleados y muestra una barra para cambiar de pantalla o reiniciar. Se carga ANTES de core.js. */
(function(){
  var TURNOS = "barberpro_turnos_v2", DAY = "barberpro_demo_day";
  var hoy = new Date(), iso = hoy.getFullYear() + "-" + (hoy.getMonth() + 1) + "-" + hoy.getDate();
  try{
    if(localStorage.getItem(DAY) !== iso){ localStorage.removeItem(TURNOS); localStorage.setItem(DAY, iso); }
  }catch(e){}

  function reiniciar(){
    try{
      ["barberpro_turnos_v2", "barberpro_accounts_v2", "barberpro_client_profile_v2", "barberpro_owner_authed", "barberpro_intro_seen"].forEach(function(k){
        localStorage.removeItem(k); sessionStorage.removeItem(k);
      });
    }catch(e){}
    location.reload();
  }

  document.addEventListener("DOMContentLoaded", function(){
    try{
      if(window.state && state.config && !state.config.staffPins){ state.config.staffPins = {lucas: "1111", nico: "2222"}; saveState(); }
    }catch(e){}
    var panel = window.BARBERPRO_PAGE === "admin";
    var bar = document.createElement("div");
    bar.className = "demo-bar" + (panel ? " is-panel" : "");
    bar.innerHTML =
      '<span class="demo-tag">DEMO</span>' +
      '<span class="demo-txt">' + (panel ? "PIN dueño <b>1234</b> · Lucas <b>1111</b> · Nico <b>2222</b>" : "Reservá como si fueras un cliente") + '</span>' +
      '<a href="' + (panel ? "app.html" : "panel.html") + '" target="_blank" rel="noopener">' + (panel ? "Ver app del cliente" : "Ver panel del dueño") + '</a>' +
      '<button type="button" id="demoReset">Reiniciar</button>';
    document.body.appendChild(bar);
    document.getElementById("demoReset").onclick = function(){
      if(confirm("¿Reiniciar la demo? Se borra lo que cargaste y vuelven los datos de ejemplo.")) reiniciar();
    };
  });
})();
