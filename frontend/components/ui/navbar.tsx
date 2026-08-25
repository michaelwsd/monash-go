import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "./navigation-menu";

import { DirectionProvider } from "@/components/ui/direction";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function NavBar() {
  return (
    <NavigationMenu>
      <NavigationMenuList className="w-full">
        <div className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-row items-start gap-4">
            <NavigationMenuItem>
              <NavigationMenuLink>Find A Ride</NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink>Post A Ride</NavigationMenuLink>
            </NavigationMenuItem>
          </div>
          <div className="flex flex-row items-center gap-4">
            <NavigationMenuItem>
              <NavigationMenuTrigger>Profile</NavigationMenuTrigger>
              <NavigationMenuContent>
                <NavigationMenuLink>Past Trips</NavigationMenuLink>
                <NavigationMenuLink>Settings</NavigationMenuLink>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <Avatar>
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

export { NavBar };
