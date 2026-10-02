/** TT-85: ni entradas cargadas ni timer corriendo. */
export function TrackerEmpty() {
  return (
    <div className="rounded-lg border border-dashed px-6 py-12 text-center">
      <p className="font-medium">Todavía no cargaste horas</p>
      <p className="text-muted-foreground mt-1 text-sm">
        Escribí en qué estás trabajando y tocá Iniciar.
      </p>
    </div>
  );
}
