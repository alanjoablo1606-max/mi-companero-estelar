export function chatErrorMessage(error: unknown): string {
  const value = error && typeof error === "object" ? error as { statusCode?: number; responseBody?: string; message?: string; name?: string } : {};
  let safeMessage: string | undefined;
  try {
    const body = JSON.parse(value.responseBody ?? "{}") as { message?: string; error?: { message?: string } };
    safeMessage = body.message ?? body.error?.message;
  } catch { /* Not every failure includes JSON. */ }
  if (value.statusCode === 402) return safeMessage ?? "Orbix no puede responder porque faltan créditos de IA. Añade créditos de IA en Lovable para continuar.";
  if (value.statusCode === 403) return safeMessage ?? "El acceso a la IA está bloqueado. Revisa los permisos de IA del espacio de trabajo.";
  if (value.statusCode === 401) return "La conexión con la IA no está configurada correctamente. Revisa la configuración de Orbix.";
  if (value.statusCode === 429) return safeMessage ?? "La IA está recibiendo muchas solicitudes. Espera un momento antes de volver a enviar.";
  if (value.statusCode === 404) return safeMessage ?? "La IA no está disponible en este momento.";
  if (value.name === "AbortError") return "Respuesta detenida.";
  if (value.statusCode && value.statusCode >= 500) return safeMessage ?? "No se pudo conectar con la IA. Inténtalo de nuevo más tarde.";
  return "No se pudo completar la respuesta. Comprueba tu conexión e inténtalo de nuevo.";
}