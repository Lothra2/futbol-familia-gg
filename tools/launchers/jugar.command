#!/bin/bash
cd "$(dirname "$0")"
echo "Abriendo Futbol Familia GG en http://localhost:8080"
echo "Deja esta ventana abierta mientras juegas. Ciérrala para parar."
(sleep 1; open http://localhost:8080 2>/dev/null || xdg-open http://localhost:8080) &
python3 -m http.server 8080
