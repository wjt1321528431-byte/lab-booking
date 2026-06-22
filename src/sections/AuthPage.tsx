import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '../contexts/AuthContext';
import { findUserByEmployeeId, addUser } from '../utils/storage';
import type { User } from '../types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FlaskConical, LogIn, UserPlus } from 'lucide-react';

export default function AuthPage() {
  const { login } = useAuth();

  // Login state
  const [loginEmployeeId, setLoginEmployeeId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Register state
  const [regName, setRegName] = useState('');
  const [regPi, setRegPi] = useState('');
  const [regEmployeeId, setRegEmployeeId] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const user = await findUserByEmployeeId(loginEmployeeId.trim());
      if (!user) {
        setLoginError('工号不存在，请先注册');
        return;
      }
      if (user.passwordHash !== loginPassword) {
        setLoginError('密码错误');
        return;
      }
      login(user);
    } catch (err: any) {
      console.error('登录/注册错误:', err?.message || err);
      setLoginError('服务器连接失败：' + (err?.message || '无法访问数据库，请检查网络'));
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegSuccess('');

    if (!regName.trim() || !regPi.trim() || !regEmployeeId.trim() || !regPassword.trim()) {
      setRegError('请填写所有字段');
      return;
    }
    if (regPassword !== regConfirm) {
      setRegError('两次密码不一致');
      return;
    }
    if (regPassword.length < 6) {
      setRegError('密码至少6位');
      return;
    }
    try {
      const existing = await findUserByEmployeeId(regEmployeeId.trim());
      if (existing) {
        setRegError('该工号已注册');
        return;
      }

      const newUser: User = {
        id: `user_${Date.now()}`,
        name: regName.trim(),
        pi: regPi.trim(),
        employeeId: regEmployeeId.trim(),
        passwordHash: regPassword,
        role: 'user',
        createdAt: new Date().toISOString(),
      };
      await addUser(newUser);
      setRegSuccess('注册成功！请登录');
      setRegName('');
      setRegPi('');
      setRegEmployeeId('');
      setRegPassword('');
      setRegConfirm('');
    } catch (err: any) {
      console.error('注册错误:', err?.message || err);
      setRegError('服务器连接失败：' + (err?.message || '无法访问数据库，请检查网络'));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div className="bg-blue-600 text-white rounded-full p-4 shadow-lg">
              <FlaskConical size={36} />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-800">实验室预约系统</h1>
          <p className="text-gray-500 mt-1 text-sm">Laboratory Booking System</p>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-center text-lg text-gray-700">账户登录 / 注册</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login" className="flex items-center gap-1">
                  <LogIn size={15} /> 登录
                </TabsTrigger>
                <TabsTrigger value="register" className="flex items-center gap-1">
                  <UserPlus size={15} /> 注册
                </TabsTrigger>
              </TabsList>

              {/* Login Tab */}
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="login-eid">工号</Label>
                    <Input
                      id="login-eid"
                      placeholder="请输入工号"
                      value={loginEmployeeId}
                      onChange={(e) => setLoginEmployeeId(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="login-pw">密码</Label>
                    <Input
                      id="login-pw"
                      type="password"
                      placeholder="请输入密码"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  {loginError && (
                    <p className="text-sm text-red-500 bg-red-50 rounded p-2">{loginError}</p>
                  )}
                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                    登录
                  </Button>
                </form>
              </TabsContent>

              {/* Register Tab */}
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-3">
                  <div>
                    <Label htmlFor="reg-name">姓名</Label>
                    <Input
                      id="reg-name"
                      placeholder="请输入真实姓名"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reg-pi">PI（导师/负责人）</Label>
                    <Input
                      id="reg-pi"
                      placeholder="请输入所属PI姓名"
                      value={regPi}
                      onChange={(e) => setRegPi(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reg-eid">工号</Label>
                    <Input
                      id="reg-eid"
                      placeholder="请输入工号（唯一标识）"
                      value={regEmployeeId}
                      onChange={(e) => setRegEmployeeId(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reg-pw">密码</Label>
                    <Input
                      id="reg-pw"
                      type="password"
                      placeholder="至少6位"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reg-confirm">确认密码</Label>
                    <Input
                      id="reg-confirm"
                      type="password"
                      placeholder="再次输入密码"
                      value={regConfirm}
                      onChange={(e) => setRegConfirm(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  {regError && (
                    <p className="text-sm text-red-500 bg-red-50 rounded p-2">{regError}</p>
                  )}
                  {regSuccess && (
                    <p className="text-sm text-green-600 bg-green-50 rounded p-2">{regSuccess}</p>
                  )}
                  <Button type="submit" className="w-full bg-green-600 hover:bg-green-700">
                    注册账号
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
