/** Client helper: undo previously logged movements via the movements API. */
export async function undoMovements(
  ids: string[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `/api/movements?ids=${encodeURIComponent(ids.join(","))}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error" };
  }
}
