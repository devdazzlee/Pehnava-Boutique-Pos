"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Store, User, Bell, CreditCard, Printer, Shield, Database, Wifi } from "lucide-react"

export function Settings() {
  const [storeSettings, setStoreSettings] = useState({
    storeName: "Pehnawa Boutique",
    address: "G-1, Soldier Bazar, Karachi",
    phone: "+92-333-2757629",
    email: "pehnawastore.pk@gmail.com",
    taxRate: "8.00",
    currency: "USD",
  })

  const [userSettings, setUserSettings] = useState({
    username: "admin",
    email: "admin@pehnawa.com",
    role: "Administrator",
  })

  const [systemSettings, setSystemSettings] = useState({
    autoBackup: true,
    emailNotifications: true,
    lowStockAlerts: true,
    printReceipts: true,
    soundEffects: false,
    darkMode: false,
  })

  const handleSaveStoreSettings = () => {
    // Save store settings logic
    alert("Store settings saved successfully!")
  }

  const handleSaveUserSettings = () => {
    // Save user settings logic
    alert("User settings saved successfully!")
  }

  const handleSaveSystemSettings = () => {
    // Save system settings logic
    alert("System settings saved successfully!")
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm md:text-base text-gray-600">Manage your store and system preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Store Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Store className="h-5 w-5" />
              <span>Store Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="storeName">Store Name</Label>
              <Input
                id="storeName"
                value={storeSettings.storeName}
                onChange={(e) => setStoreSettings({ ...storeSettings, storeName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={storeSettings.address}
                onChange={(e) => setStoreSettings({ ...storeSettings, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={storeSettings.phone}
                  onChange={(e) => setStoreSettings({ ...storeSettings, phone: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={storeSettings.email}
                  onChange={(e) => setStoreSettings({ ...storeSettings, email: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="taxRate">Tax Rate (%)</Label>
                <Input
                  id="taxRate"
                  value={storeSettings.taxRate}
                  onChange={(e) => setStoreSettings({ ...storeSettings, taxRate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={storeSettings.currency}
                  onValueChange={(value) => setStoreSettings({ ...storeSettings, currency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="INR">INR (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleSaveStoreSettings} className="w-full">
              Save Store Settings
            </Button>
          </CardContent>
        </Card>

        {/* User Account */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>User Account</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={userSettings.username}
                onChange={(e) => setUserSettings({ ...userSettings, username: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="userEmail">Email</Label>
              <Input
                id="userEmail"
                type="email"
                value={userSettings.email}
                onChange={(e) => setUserSettings({ ...userSettings, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <Select
                value={userSettings.role}
                onValueChange={(value) => setUserSettings({ ...userSettings, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Administrator">Administrator</SelectItem>
                  <SelectItem value="Manager">Manager</SelectItem>
                  <SelectItem value="Cashier">Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div>
              <Label htmlFor="newPassword">New Password</Label>
              <Input id="newPassword" type="password" placeholder="Enter new password" />
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input id="confirmPassword" type="password" placeholder="Confirm new password" />
            </div>
            <Button onClick={handleSaveUserSettings} className="w-full">
              Save User Settings
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* System Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>System Preferences</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900 flex items-center space-x-2">
                <Bell className="h-4 w-4" />
                <span>Notifications</span>
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="emailNotifications">Email Notifications</Label>
                  <Switch
                    id="emailNotifications"
                    checked={systemSettings.emailNotifications}
                    onCheckedChange={(checked) => setSystemSettings({ ...systemSettings, emailNotifications: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="lowStockAlerts">Low Stock Alerts</Label>
                  <Switch
                    id="lowStockAlerts"
                    checked={systemSettings.lowStockAlerts}
                    onCheckedChange={(checked) => setSystemSettings({ ...systemSettings, lowStockAlerts: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="soundEffects">Sound Effects</Label>
                  <Switch
                    id="soundEffects"
                    checked={systemSettings.soundEffects}
                    onCheckedChange={(checked) => setSystemSettings({ ...systemSettings, soundEffects: checked })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-gray-900 flex items-center space-x-2">
                <Database className="h-4 w-4" />
                <span>System</span>
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="autoBackup">Auto Backup</Label>
                  <Switch
                    id="autoBackup"
                    checked={systemSettings.autoBackup}
                    onCheckedChange={(checked) => setSystemSettings({ ...systemSettings, autoBackup: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="printReceipts">Print Receipts</Label>
                  <Switch
                    id="printReceipts"
                    checked={systemSettings.printReceipts}
                    onCheckedChange={(checked) => setSystemSettings({ ...systemSettings, printReceipts: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="darkMode">Dark Mode</Label>
                  <Switch
                    id="darkMode"
                    checked={systemSettings.darkMode}
                    onCheckedChange={(checked) => setSystemSettings({ ...systemSettings, darkMode: checked })}
                  />
                </div>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center space-x-2">
                  <Printer className="h-4 w-4" />
                  <span>Printer Settings</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select defaultValue="default">
                  <SelectTrigger>
                    <SelectValue placeholder="Select printer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default Printer</SelectItem>
                    <SelectItem value="thermal">Thermal Printer</SelectItem>
                    <SelectItem value="laser">Laser Printer</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center space-x-2">
                  <CreditCard className="h-4 w-4" />
                  <span>Payment Gateway</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select defaultValue="stripe">
                  <SelectTrigger>
                    <SelectValue placeholder="Select gateway" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="paypal">PayPal</SelectItem>
                    <SelectItem value="square">Square</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center space-x-2">
                  <Wifi className="h-4 w-4" />
                  <span>Network Status</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-green-600">Connected</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6">
            <Button onClick={handleSaveSystemSettings} className="w-full">
              Save System Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Backup & Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <span>Backup & Security</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Data Backup</h3>
              <p className="text-sm text-gray-600">Last backup: January 15, 2024 at 2:30 PM</p>
              <div className="space-y-2">
                <Button variant="outline" className="w-full">
                  Create Backup Now
                </Button>
                <Button variant="outline" className="w-full">
                  Restore from Backup
                </Button>
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Security</h3>
              <p className="text-sm text-gray-600">Manage security settings and access controls</p>
              <div className="space-y-2">
                <Button variant="outline" className="w-full">
                  View Access Logs
                </Button>
                <Button variant="outline" className="w-full">
                  Reset All Sessions
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
