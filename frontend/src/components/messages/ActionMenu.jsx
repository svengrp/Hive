import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import classes from "./Overlays.module.css";

const itemsOf = (node) => Array.from(node?.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]') || []);

/* Rangée de réactions (item { reactions, selected, onReact }) partagée par le menu et la feuille */
export function ReactionRow({ item, onPicked, large = false }) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t("messages.react")} className={`${classes.reactionRow} ${large ? classes.reactionRowLarge : ""}`}>
      {item.reactions.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="menuitemcheckbox"
          aria-checked={item.selected.has(emoji)}
          tabIndex={large ? undefined : -1} /* menu : navigation aux flèches ; feuille : tabulation */
          className={`${classes.reactionPick} ${item.selected.has(emoji) ? classes.reactionPickOn : ""}`}
          aria-label={t("messages.reactWith", { emoji })}
          onClick={() => { onPicked(); item.onReact(emoji); }}
        >
          <span aria-hidden="true">{emoji}</span>
        </button>
      ))}
    </div>
  );
}

/* Menu ⋯ partagé (en-tête de discussion et bulles).
   items : [{ key, label, icon: Icone, onSelect, danger }] ou { key, separator: true }.
   Clavier : focus sur le 1er item, flèches cycliques, Début / Fin, Échap (rend le focus), Tab ferme. */
export default function ActionMenu({
  items,
  buttonLabel,
  buttonClassName = "",
  openClassName = "",
  icon,
  wrapperClassName = "",
  onOpenChange,
}) {
  const [open, setOpen] = useState(false);
  const [placeUp, setPlaceUp] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  const setOpenState = (value) => {
    setOpen(value);
    onOpenChange?.(value);
  };
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => { onOpenChangeRef.current = onOpenChange; }, [onOpenChange]);

  const menuItems = () => itemsOf(menuRef.current);

  // Place le menu vers le haut s'il manque de place sous le bouton (dans la zone qui défile),
  // et l'aligne sur la gauche du bouton s'il dépasserait à gauche de cette zone (message reçu)
  useLayoutEffect(() => {
    if (!open || !menuRef.current || !buttonRef.current) {
      setAlignLeft(false);
      return;
    }
    const boundary = buttonRef.current.closest("[data-menu-boundary]");
    const zone = boundary ? boundary.getBoundingClientRect() : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
    const btnRect = buttonRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current.offsetHeight;
    const menuWidth = menuRef.current.offsetWidth;
    setPlaceUp(btnRect.bottom + 4 + menuHeight > zone.bottom - 8 && btnRect.top - menuHeight - 4 > 8);
    setAlignLeft(btnRect.right - menuWidth < zone.left + 8 && btnRect.left + menuWidth <= zone.right - 8);
    itemsOf(menuRef.current)[0]?.focus();
  }, [open]);

  // Clic extérieur : fermeture
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (menuRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return;
      setOpen(false);
      onOpenChangeRef.current?.(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const close = (returnFocus) => {
    setOpenState(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  const onMenuKeyDown = (e) => {
    const list = menuItems();
    const index = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); list[(index + 1) % list.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(index - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); list[list.length - 1]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "Tab") { close(false); }
  };

  const onButtonKeyDown = (e) => {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
      e.preventDefault();
      setOpenState(true);
    }
  };

  return (
    <div className={`${classes.menuWrap} ${wrapperClassName}`.trim()}>
      <button
        ref={buttonRef}
        type="button"
        className={`${buttonClassName} ${open ? openClassName : ""}`.trim()}
        aria-label={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpenState(!open)}
        onKeyDown={onButtonKeyDown}
      >
        {icon}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={buttonLabel}
          className={`${classes.menu} ${placeUp ? classes.menuUp : ""} ${alignLeft ? classes.menuLeft : ""}`}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) =>
            item.reactions ? (
              <ReactionRow key={item.key} item={item} onPicked={() => close(true)} />
            ) : item.separator ? (
              <div key={item.key} role="separator" className={classes.menuSeparator} />
            ) : (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={`${classes.menuItem} ${item.danger ? classes.menuItemDanger : ""}`}
                onClick={() => {
                  close(!item.keepFocus);
                  item.onSelect();
                }}
              >
                {item.icon && <item.icon size={18} aria-hidden="true" />}
                <span>{item.label}</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
