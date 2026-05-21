"use client";


import {
  AnimatePresence,
  MotionValue,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { useRef, useState } from "react";
import styles from "./index.module.css";
import { DOCK_CONFIG } from "./dockConfig";

export interface FloatingDockItem {
  title: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
}

export const FloatingDock = ({
  logo,
  items,
}: {
  logo?: React.ReactNode;
  items: FloatingDockItem[];
}) => {
  return (
    <FloatingDockDesktop logo={logo} items={items} />
  );
};

const FloatingDockDesktop = ({
  logo,
  items,
}: {
  logo?: React.ReactNode;
  items: FloatingDockItem[];
}) => {
  const mouseY = useMotionValue(Infinity);
  
  const dockWidth = `calc(${DOCK_CONFIG.icon.magnifiedSize}px + (2 * ${DOCK_CONFIG.container.paddingHorizontal}))`;

  return (
    <motion.div
      onMouseMove={(e) => mouseY.set(e.pageY)}
      onMouseLeave={() => mouseY.set(Infinity)}
      className={styles.dockDesktop}
      style={{
        width: dockWidth,
        padding: `${DOCK_CONFIG.container.paddingVertical} ${DOCK_CONFIG.container.paddingHorizontal}`,
        borderRadius: DOCK_CONFIG.container.borderRadius,
        backgroundColor: DOCK_CONFIG.container.backgroundColor,
        border: `${DOCK_CONFIG.container.borderWidth} ${DOCK_CONFIG.container.borderStyle} ${DOCK_CONFIG.container.borderColor}`,
        boxShadow: DOCK_CONFIG.container.boxShadow,
      }}
    >
      {logo && (
        <div className={styles.logoContainer}>
          {logo}
        </div>
      )}
      
      <div className={styles.itemsContainer} style={{ gap: DOCK_CONFIG.container.gap }}>
        {items.map((item) => (
          <IconContainer mouseY={mouseY} key={item.title} {...item} />
        ))}
      </div>
    </motion.div>
  );
};

function IconContainer({
  mouseY,
  title,
  icon,
  onClick,
}: FloatingDockItem & { mouseY: MotionValue }) {
  const ref = useRef<HTMLButtonElement>(null);

  const distance = useTransform(mouseY, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { y: 0, height: 0 };
    return val - bounds.y - bounds.height / 2;
  });

  const sizeTransform = useTransform(
    distance, 
    [-DOCK_CONFIG.animation.magnificationDistance, 0, DOCK_CONFIG.animation.magnificationDistance], 
    [DOCK_CONFIG.icon.baseSize, DOCK_CONFIG.icon.magnifiedSize, DOCK_CONFIG.icon.baseSize]
  );
  
  const iconSizeTransform = useTransform(
    distance, 
    [-DOCK_CONFIG.animation.magnificationDistance, 0, DOCK_CONFIG.animation.magnificationDistance], 
    [DOCK_CONFIG.icon.baseIconInnerSize, DOCK_CONFIG.icon.magnifiedIconInnerSize, DOCK_CONFIG.icon.baseIconInnerSize]
  );

  const size = useSpring(sizeTransform, {
    mass: DOCK_CONFIG.animation.mass,
    stiffness: DOCK_CONFIG.animation.stiffness,
    damping: DOCK_CONFIG.animation.damping,
  });

  const iconSize = useSpring(iconSizeTransform, {
    mass: DOCK_CONFIG.animation.mass,
    stiffness: DOCK_CONFIG.animation.stiffness,
    damping: DOCK_CONFIG.animation.damping,
  });

  const [hovered, setHovered] = useState(false);

  return (
    <button 
      ref={ref}
      onClick={onClick} 
      className={styles.iconContainer}
      style={{
        width: DOCK_CONFIG.icon.magnifiedSize,
        height: DOCK_CONFIG.icon.magnifiedSize,
        color: hovered ? DOCK_CONFIG.icon.hoverColor : DOCK_CONFIG.icon.defaultColor,
      }}
    >
      <motion.div
        style={{ width: size, height: size }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={styles.iconWrapper}
      >
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, x: 10, y: "-50%" }}
              animate={{ opacity: 1, x: 0, y: "-50%" }}
              exit={{ opacity: 0, x: 2, y: "-50%" }}
              className={styles.tooltip}
              style={{
                backgroundColor: DOCK_CONFIG.tooltip.backgroundColor,
                borderColor: DOCK_CONFIG.tooltip.borderColor,
                color: DOCK_CONFIG.tooltip.textColor,
                fontSize: DOCK_CONFIG.tooltip.fontSize,
                fontWeight: DOCK_CONFIG.tooltip.fontWeight,
                marginLeft: DOCK_CONFIG.tooltip.marginLeft,
              }}
            >
              {title}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          style={{ width: iconSize, height: iconSize }}
          className={styles.iconInner}
        >
          {icon}
        </motion.div>
      </motion.div>
    </button>
  );
}



