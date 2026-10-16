<?php
/**
 * api/actualizar_estatus.php  (POST)
 * Cambia el estatus de un documento. Campos: id_documento, estatus
 */
require __DIR__ . '/../conexion.php';
exigirMetodo('POST');

$id      = (int)($_POST['id_documento'] ?? 0);
$estatus = trim($_POST['estatus'] ?? '');

if ($id <= 0 || !in_array($estatus, ESTATUS_VALIDOS, true)) {
    responder(['ok' => false, 'error' => 'Datos inválidos.'], 422);
}

$db = conectaDB();
$stmt = $db->prepare('UPDATE documentos SET estatus = ? WHERE id_documento = ?');
$stmt->bind_param('si', $estatus, $id);
if (!$stmt->execute()) {
    responder(['ok' => false, 'error' => 'No se pudo actualizar el estatus.'], 500);
}
$stmt->close();
$db->close();

responder(['ok' => true, 'estatus' => $estatus]);
