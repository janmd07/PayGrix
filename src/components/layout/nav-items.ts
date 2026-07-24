import {
  BarChart3,
  Building2,
  CreditCard,
  Landmark,
  Settings,
  UsersRound,
  ArrowLeftRight,
  LineChart,
  QrCode,
} from "lucide-react";

export const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: BarChart3,
  },
  {
    title: "Pay",
    href: "/pay",
    icon: QrCode,
  },
  {
    title: "Analytics",
    href: "/analytics",
    icon: LineChart,
  },
  {
    title: "Contributors",
    href: "/contributors",
    icon: UsersRound,
  },
  {
    title: "Payroll",
    href: "/payroll",
    icon: CreditCard,
  },
  {
    title: "Treasury",
    href: "/treasury",
    icon: Landmark,
  },
  {
    title: "Bridge",
    href: "/bridge",
    icon: ArrowLeftRight,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export const productNavItem = {
  title: "PayGrid",
  href: "/",
  icon: Building2,
};
