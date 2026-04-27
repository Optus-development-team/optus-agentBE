#!/bin/bash

# Animación de carga tipo spinner
spinner() {
    local pid=$1
    local delay=0.1
    local spinstr='|/-\'
    while kill -0 $pid 2>/dev/null; do
        local temp=${spinstr#?}
        printf " [%c]  " "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\b\b\b\b\b\b"
    done
    printf "      \b\b\b\b\b\b"
}

# Limpiar pantalla para inicio del proceso
clear

# Generar IDs aleatorios para el endpoint
ID_EMPRESA=$((RANDOM % 8999 + 1000))
ID_PRODUCTO=$((RANDOM % 89999 + 10000))
ENDPOINT="https://optus.lat/info/product/${ID_EMPRESA}/${ID_PRODUCTO}"

echo "========================================================="
echo "               SISTEMA DE PAGOS x402                     "
echo "========================================================="
echo ""

# Confirmación inicial
read -p ">> ¿Desea iniciar la petición GET al producto? (y/n): " confirm_start
if [[ "$confirm_start" != "y" && "$confirm_start" != "Y" ]]; then
    echo -e "\nOperación abortada por el usuario."
    exit 0
fi

echo -e "\n[+] Estableciendo conexión con $ENDPOINT"
(sleep 2) &
spinner $!

echo "[+] Solicitando información del producto..."
(sleep 1.5) &
spinner $!

echo -e "\n[!] Respuesta del servidor recibida:"
echo "---------------------------------------------------------"
echo "HTTP/1.1 402 Payment Required"
echo "Content-Type: application/json"
echo ""
echo "{"
echo "  \"status\": \"error\","
echo "  \"code\": 402,"
echo "  \"message\": \"Payment Required to access this resource\","
echo "  \"payment_requirements\": {"
echo "    \"amount\": \"0.01 USDC\","
echo "    \"accepted_networks\": [\"arc testnet\"]"
echo "  }"
echo "}"
echo "---------------------------------------------------------"
echo ""

# Confirmación de pago
read -p ">> ¿Desea firmar la transacción por 0.01 USDC en la red [arc testnet]? (y/n): " confirm_pay
if [[ "$confirm_pay" != "y" && "$confirm_pay" != "Y" ]]; then
    echo -e "\nTransacción declinada. Conexión cerrada."
    exit 0
fi

echo -e "\n[+] Iniciando entorno de firma local..."
(sleep 1) &
spinner $!

echo "[+] Firmando payload criptográfico..."
(sleep 2.5) &
spinner $!

# Generar hash de transacción aleatorio
TX_HASH="0x$(tr -dc 'a-f0-9' < /dev/urandom | head -c 64)"
echo -e "\n[✓] Transacción firmada correctamente."
echo "    Hash TX: $TX_HASH"
echo ""

echo "[+] Reenviando petición POST al endpoint con el payload de pago..."
(sleep 2) &
spinner $!

echo "[+] Esperando confirmación de bloque en la red arc testnet..."
(sleep 3.5) &
spinner $!

echo -e "\n\n[✓] Transacción procesada. Descifrando respuesta:"
echo "---------------------------------------------------------"
echo "HTTP/1.1 200 OK"
echo "Content-Type: application/json"
echo ""
echo "{"
echo "  \"status\": \"success\","
echo "  \"message\": \"Payment Verified\","
echo "  \"data\": {"
echo "    \"id_empresa\": \"$ID_EMPRESA\","
echo "    \"id_producto\": \"$ID_PRODUCTO\","
echo "    \"product_name\": \"Intel Core Ultra 7\","
echo "    \"data\": {"
echo "      \"price\": \"Bs. 5229.00\","
echo "      \"timestamp\": \"1777164802\""
echo "    }"
echo "  }"
echo "}"
echo "---------------------------------------------------------"
echo "========================================================="
echo "    PROCESO x402 COMPLETADO EXITOSAMENTE                 "
echo "========================================================="
echo ""