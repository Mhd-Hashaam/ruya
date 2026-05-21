export const DOCK_CONFIG = {
  /**
   * Layout & Positioning
   */
  container: {
    gap: "2rem",
    paddingVertical: "2rem",
    paddingHorizontal: "1rem",
    borderRadius: "2.5rem",
    backgroundColor: "#000000",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.15)",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
    marginLeft: "2rem", // Distance from the left screen edge
  },

  /**
   * Icon Sizing & Magnification
   */
  icon: {
    baseSize: 48,      // Default width/height in px
    magnifiedSize: 64, // Max width/height on hover in px
    baseIconInnerSize: 24,      // Size of the icon itself inside the container
    magnifiedIconInnerSize: 32, // Max size of the icon itself on hover
    defaultColor: "#a3a3a3",
    hoverColor: "#ffffff",
  },

  /**
   * Tooltip Styles
   */
  tooltip: {
    backgroundColor: "#171717",
    borderColor: "#262626",
    textColor: "#e5e5e5",
    fontSize: "0.875rem",
    fontWeight: 500,
    marginLeft: "1rem",
  },

  /**
   * Animation Settings
   */
  animation: {
    mass: 0.1,
    stiffness: 150,
    damping: 15,
    magnificationDistance: 120, // Slightly tighter distance for better control
  }
};
