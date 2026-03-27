// =============================================================================
// Pure Alpha Mobile -- Shared Icon Component (Ionicons)
// SSOT for all icons in the app. Zero emoji.
// =============================================================================

import Ionicons from "@expo/vector-icons/Ionicons";
import { group } from "./tokens";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  accessible?: boolean;
}

export function Icon({ name, size = 24, color = group.white, accessible = false }: IconProps) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      accessible={accessible}
    />
  );
}

// Tab bar icon helper -- renders filled when active, outline when inactive
export function TabIcon({
  active,
  activeName,
  inactiveName,
  size = 24,
  activeColor,
  inactiveColor,
  accessible = false,
}: {
  active: boolean;
  activeName: IconName;
  inactiveName: IconName;
  size?: number;
  activeColor: string;
  inactiveColor: string;
  accessible?: boolean;
}) {
  return (
    <Ionicons
      name={active ? activeName : inactiveName}
      size={size}
      color={active ? activeColor : inactiveColor}
      accessible={accessible}
    />
  );
}
