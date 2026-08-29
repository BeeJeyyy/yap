
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
    <>
      <div className="flex justify-center items-center min-h-screen">
        <Card className="w-full max-w-md overflow-hidden">
          <CardContent className="p-0">
            <Tabs defaultValue="login" className="w-full p-4">
              <TabsList className="w-full">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Signup</TabsTrigger>
              </TabsList>
              <TabsContent value='login'>
                <Login />
              </TabsContent>
              <TabsContent value='signup'>
                <Signup />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
