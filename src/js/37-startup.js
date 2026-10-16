// ==== Startup / bootstrap ====
// This file loads last so every function and element it wires up already exists.
// Kick off the first-run tour and bind the header buttons: Download .sav / .json go through the review dialog, plus Save report and Download history.
uiTourAuto();
document.getElementById('btn-download-sav').addEventListener('click', () => reviewAndDownload('sav'));
document.getElementById('btn-download-json').addEventListener('click', () => reviewAndDownload('json'));
document.getElementById('btn-report').addEventListener('click', openSaveReport);
document.getElementById('btn-history').addEventListener('click', openHistory);
