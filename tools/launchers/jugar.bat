@echo off
cd /d "%~dp0"
echo Abriendo Futbol Familia GG en http://localhost:8080
echo Deja esta ventana abierta mientras juegas. Ciérrala para parar.
start "" http://localhost:8080
python -m http.server 8080 2>nul || py -m http.server 8080
