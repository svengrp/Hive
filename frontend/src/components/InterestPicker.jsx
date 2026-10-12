import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { INTERESTS, MAX_INTERESTS } from "../lib/interests";
import classes from "./InterestPicker.module.css";

/* Pastilles de centres d'intérêt à cocher, 3 au maximum. Une fois la limite atteinte,
   les autres sujets restent visibles mais inactifs : on en retire un pour changer. */
export default function InterestPicker({ value, onChange, labelledBy }) {
  const { t } = useTranslation();
  const full = value.length >= MAX_INTERESTS;

  const toggle = (key) => {
    if (value.includes(key)) onChange(value.filter((item) => item !== key));
    else if (!full) onChange([...value, key]);
  };

  return (
    <div className={classes.grid} role="group" aria-labelledby={labelledBy}>
      {INTERESTS.map(({ key, Icon }) => {
        const selected = value.includes(key);
        return (
          <button
            key={key}
            type="button"
            className={`${classes.option} ${selected ? classes.selected : ""}`}
            aria-pressed={selected}
            disabled={!selected && full}
            onClick={() => toggle(key)}
          >
            {selected
              ? <Check size={16} strokeWidth={2.5} aria-hidden="true" className={classes.check} />
              : <Icon size={16} strokeWidth={1.75} aria-hidden="true" className={classes.icon} />}
            <span>{t(`interests.${key}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
