import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { easeOut } from "../lib/ui";

/** Número que conta até `value` (e de um valor para o outro quando muda). Sem animação com reduced motion. */
export function CountUp({ value, delay = 0, duration = 0.6, className }: { value: number; delay?: number; duration?: number; className?: string }) {
  const still = useReducedMotion();
  const n = useMotionValue(still ? value : 0);
  const text = useTransform(n, (v) => String(Math.round(v)));
  useEffect(() => {
    if (still) { n.set(value); return; }
    const a = animate(n, value, { delay, duration, ease: easeOut });
    return () => a.stop();
  }, [value, delay, duration, still, n]);
  return <motion.span className={className}>{text}</motion.span>;
}

/** Barra de progresso que enche do zero ao aparecer. `pct` de 0 a 100. */
export function FillBar({ pct, delay = 0, className, barClassName, style }: { pct: number; delay?: number; className?: string; barClassName?: string; style?: CSSProperties }) {
  return (
    <span className={`block overflow-hidden ${className ?? ""}`}>
      <motion.span
        className={`block h-full origin-left rounded-full ${barClassName ?? ""}`}
        style={style}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: Math.max(0, Math.min(100, pct)) / 100 }}
        transition={{ delay, duration: 0.6, ease: easeOut }}
      />
    </span>
  );
}

/** Bloco que sobe e aparece quando entra na tela, uma vez só. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ delay, duration: 0.45, ease: easeOut }}
    >
      {children}
    </motion.div>
  );
}

