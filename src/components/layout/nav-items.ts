import {
  BarChart3,
  Building2,
  CreditCard,
  Settings,
  UsersRound,
  ArrowLeftRight,
  ArrowUpDown,
  QrCode,
  User,
  Coins,
  HandCoins,
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
    title: "Profile",
    href: "/profile",
    icon: User,
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
    title: "Swap",
    href: "/swap",
    icon: ArrowUpDown,
  },
  {
    title: "Bridge",
    href: "/bridge",
    icon: ArrowLeftRight,
  },
  {
    title: "Pool",
    href: "/pool",
    icon: Coins,
  },
  {
    title: "Lending",
    href: "/lending",
    icon: HandCoins,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export const productNavItem = {
  title: "PayGrix",
  href: "/",
  icon: Building2,
};
