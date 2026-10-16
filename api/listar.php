<?php
/**
 * api/listar.php  (GET)
 * Lista documentos con búsqueda, filtros y paginación.
 * Parámetros opcionales: q, estatus, desde, hasta, pagina, por_pagina
 */
require __DIR__ . '/../conexion.php';
exigirMetodo('GET');

$q       = trim($_GET['q'] ?? '');
$estatus = trim($_GET['estatus'] ?? '');
$desde   = trim($_GET['desde'] ?? '');
$hasta   = trim($_GET['hasta'] ?? '');
$pagina  = max(1, (int)($_GET['pagina'] ?? 1));
$porPag  = min(50, max(1, (int)($_GET['por_pagina'] ?? 10)));

/** Valida fechas en formato AAAA-MM-DD */
function fechaValida(string $f): bool
{
    $d = DateTime::createFromFormat('Y-m-d', $f);
    return $d && $d->format('Y-m-d') === $f;
}

$where  = [];
$tipos  = '';
$params = [];

// Búsqueda general: oficio, asunto, remitente o destinatario
if ($q !== '') {
    $like = '%' . addcslashes($q, '%_\\') . '%';
    $where[] = '(no_oficio LIKE ? OR asunto LIKE ? OR remitente LIKE ? OR destinatario LIKE ?)';
    $tipos .= 'ssss';
    array_push($params, $like, $like, $like, $like);
}
if (in_array($estatus, ESTATUS_VALIDOS, true)) {
    $where[] = 'estatus = ?';
    $tipos .= 's';
    $params[] = $estatus;
}
if ($desde !== '' && fechaValida($desde)) {
    $where[] = 'fecha >= ?';
    $tipos .= 's';
    $params[] = $desde;
}
if ($hasta !== '' && fechaValida($hasta)) {
    $where[] = 'fecha <= ?';
    $tipos .= 's';
    $params[] = $hasta;
}
$sqlWhere = $where ? 'WHERE ' . implode(' AND ', $where) : '';

$db = conectaDB();

// 1) Total de registros que cumplen el filtro
$stmt = $db->prepare("SELECT COUNT(*) FROM documentos $sqlWhere");
if ($params) {
    $stmt->bind_param($tipos, ...$params);
}
$stmt->execute();
$stmt->bind_result($total);
$stmt->fetch();
$stmt->close();

$paginas = max(1, (int)ceil($total / $porPag));
$pagina  = min($pagina, $paginas);
$offset  = ($pagina - 1) * $porPag;

// 2) Registros de la página actual
$sql = "SELECT id_documento, no_oficio, fecha, asunto, remitente, destinatario, estatus,
               EXISTS(SELECT 1 FROM archivos_pdf a WHERE a.id_documento = documentos.id_documento) AS tiene_pdf
        FROM documentos $sqlWhere
        ORDER BY fecha DESC, id_documento DESC
        LIMIT ? OFFSET ?";
$stmt = $db->prepare($sql);
$tiposPag  = $tipos . 'ii';
$paramsPag = array_merge($params, [$porPag, $offset]);
$stmt->bind_param($tiposPag, ...$paramsPag);
$stmt->execute();
$res = $stmt->get_result();

$docs = [];
while ($f = $res->fetch_assoc()) {
    $docs[] = [
        'id_documento' => (int)$f['id_documento'],
        'no_oficio'    => $f['no_oficio'],
        'fecha'        => $f['fecha'],
        'asunto'       => $f['asunto'],
        'remitente'    => $f['remitente'],
        'destinatario' => $f['destinatario'],
        'estatus'      => $f['estatus'],
        'tiene_pdf'    => (bool)$f['tiene_pdf'],
    ];
}
$stmt->close();

// 3) Total general (para el contador del menú)
$totalGeneral = (int)$db->query('SELECT COUNT(*) FROM documentos')->fetch_row()[0];
$db->close();

responder([
    'ok'            => true,
    'documentos'    => $docs,
    'total'         => (int)$total,
    'total_general' => $totalGeneral,
    'pagina'        => $pagina,
    'paginas'       => $paginas,
    'por_pagina'    => $porPag,
]);
