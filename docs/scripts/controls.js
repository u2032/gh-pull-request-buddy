

function loading_step() {
    setTimeout(function() {
        document.getElementById("loading").classList.add("w3-hide");
        document.getElementById("connection").classList.remove("w3-hide");
    }, 5000);
}