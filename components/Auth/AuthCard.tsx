import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";

import AuthTabs from "./AuthTabs";

import Login from '@/components/Auth/Login';
import Signup from "@/components/Auth/Signup";

export default function AuthCard() {
  return (
    <div className="flex justify-center items-center min-h-screen bg-background px-6 sm:px-4 py-8 sm:py-12">
      <Card className="w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg overflow-hidden shadow-lg">
        <CardContent className="p-0">
          <Tabs defaultValue="login" className="w-full">
            <div className="px-4 sm:px-6 pt-4 sm:pt-6">
              <TabsList className="w-full grid grid-cols-2 h-auto">
                <TabsTrigger 
                  value="login"
                  className="py-2 sm:py-3 text-xs sm:text-sm md:text-base font-medium"
                >
                  Login
                </TabsTrigger>
                <TabsTrigger 
                  value="signup"
                  className="py-2 sm:py-3 text-xs sm:text-sm md:text-base font-medium"
                >
                  Signup
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="px-4 sm:px-6 pb-4 sm:pb-6">
              <TabsContent value='login' className="mt-4 sm:mt-6">
                <Login />
              </TabsContent>
              <TabsContent value='signup' className="mt-4 sm:mt-6">
                <Signup />
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}