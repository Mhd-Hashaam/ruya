import styles from "./index.module.css";

interface IconButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
  size?: "sm" | "md" | "lg";
  active?: boolean;
  className?: string;
}

export const IconButton = ({
  children,
  onClick,
  label,
  size = "md",
  active = false,
  className = "",
}: IconButtonProps) => {
  return (
    <button
      type="button"
      aria-label={label}
      className={[
        styles.btn,
        styles[size],
        active ? styles.active : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
