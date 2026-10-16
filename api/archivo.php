<?php
/**
 * api/archivo.php  (GET)
 * Entrega el PDF de un documento desde la base de datos.
 *   ?id=5               → se muestra dentro del navegador (visor)
 *   ?id=5&descargar=1   → se descarga
 */
require __DIR__ . '/../conexion.php';
exigirMetodo('GET');

$id = (int)($_GET['id'] ?? 0);
$descargar = isset($_GET['descargar']);

$db = conectaDB();
$stmt = $db->prepare(
    'SELECT d.no_oficio, a.contenido
       FROM documentos d
       JOIN archivos_pdf a ON a.id_documento = d.id_documento
      WHERE d.id_documento = ?'
);
$stmt->bind_param('i', $id);
$stmt->execute();
$stmt->bind_result($noOficio, $contenido);
$existe = $stmt->fetch();
$stmt->close();
$db->close();

if (!$existe || $contenido === null || $contenido === '') {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Este documento no tiene un PDF disponible.';
    exit;
}

// Nombre amigable: Oficio_001-2026.pdf
$nombre = 'Oficio_' . preg_replace('/[^A-Za-z0-9._-]+/', '-', $noOficio) . '.pdf';

header('Content-Type: application/pdf');
header('Content-Length: ' . strlen($contenido));
header('Content-Disposition: ' . ($descargar ? 'attachment' : 'inline') . '; filename="' . $nombre . '"');
header('X-Content-Type-Options: nosniff');
echo $contenido;
