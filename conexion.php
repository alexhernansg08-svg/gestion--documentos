<?php
/**
 * conexion.php
 * Conexión a MySQL (mysqli) y utilidades comunes para la API.
 *
 * Funciona en dos entornos:
 *  - Local (XAMPP): usa los valores por defecto de abajo.
 *  - Vercel: lee las variables de entorno DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME, DB_SSL
 *    (se configuran en Vercel > Settings > Environment Variables; nunca se suben al repositorio).
 */
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_PORT', (int)(getenv('DB_PORT') ?: 3306));
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') !== false ? getenv('DB_PASS') : '');
define('DB_NAME', getenv('DB_NAME') ?: 'documento');
define('DB_SSL',  getenv('DB_SSL') === '1');   // MySQL en la nube normalmente exige TLS

/** Tamaño máximo por PDF: 4 MB (Vercel limita el cuerpo de la petición a 4.5 MB). */
const MAX_BYTES = 4 * 1024 * 1024;
/** Valores válidos de estatus */
const ESTATUS_VALIDOS = ['Recibido', 'En proceso', 'Atendido'];

/** Envía una respuesta JSON y termina la ejecución. */
function responder(array $datos, int $codigo = 200): void
{
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Abre la conexión; si falla responde con error JSON. */
function conectaDB(): mysqli
{
    mysqli_report(MYSQLI_REPORT_OFF);
    $link = mysqli_init();
    $flags = 0;
   if (DB_SSL) {
    $dont_verify = defined('MYSQLI_CLIENT_SSL_DONT_VERIFY_SERVER_CERT') 
        ? MYSQLI_CLIENT_SSL_DONT_VERIFY_SERVER_CERT 
        : 64; // Valor numérico de fallback en mysqli
    $flags = MYSQLI_CLIENT_SSL | $dont_verify;
}
    if (!@$link->real_connect(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT, null, $flags)) {
        responder(['ok' => false, 'error' => 'No se pudo conectar a la base de datos. Revisa las variables de entorno / conexion.php.'], 500);
    }
    $link->set_charset('utf8mb4');
    return $link;
}

/** Exige que la petición use el método indicado (GET o POST). */
function exigirMetodo(string $metodo): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $metodo) {
        responder(['ok' => false, 'error' => 'Método no permitido.'], 405);
    }
}
