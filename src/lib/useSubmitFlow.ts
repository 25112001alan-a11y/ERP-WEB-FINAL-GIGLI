import { useCallback, useState } from 'react';

interface UseSubmitFlowOptions {
  redirectTo?: () => void;
  redirectMs?: number;
  fallbackMessage?: string;
}

/**
 * Contrato de submit que repiten las vistas de formulario (8 sitios):
 * saving → acción → saved + redirect con timeout, o error con mensaje.
 * La validación previa de cada formulario queda en la vista (varía por
 * dominio); esto solo unifica el ciclo de vida del submit.
 */
export function useSubmitFlow({ redirectTo, redirectMs = 1500, fallbackMessage = 'No se pudo guardar.' }: UseSubmitFlowOptions = {}) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = useCallback(
    async (action: () => Promise<void>) => {
      setSaving(true);
      setError('');
      try {
        await action();
        setSaved(true);
        if (redirectTo) setTimeout(redirectTo, redirectMs);
      } catch (err) {
        setError(err instanceof Error ? err.message : fallbackMessage);
      } finally {
        setSaving(false);
      }
    },
    [redirectTo, redirectMs, fallbackMessage],
  );

  return { saved, saving, error, submit, setError };
}