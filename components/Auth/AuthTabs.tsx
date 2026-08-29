import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/ui/tabs'

export default function AuthTabs() {
    return(
        <>
        <div>
            <Tabs defaultValue='login' className='w-full p-4'>
                <TabsList className='w-full'>
                    <TabsTrigger value='login'>Login</TabsTrigger>
                    <TabsTrigger value='signup'>Signup</TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
        </>
    )
}