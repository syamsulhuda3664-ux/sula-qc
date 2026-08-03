'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, UserX, Loader2 } from 'lucide-react';

const ROLES = ['staff_qa', 'manager_qc', 'manager_umum', 'spv_qc'];

interface User {
  id: string;
  username: string;
  display_name: string;
  role: string;
  is_active: boolean;
  created_at?: string;
}

export default function UsersPage() {
  const { t } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('staff_qa');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : data.users || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openAdd = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormDisplayName('');
    setFormPassword('');
    setFormRole('staff_qa');
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setFormUsername(user.username);
    setFormDisplayName(user.display_name);
    setFormPassword('');
    setFormRole(user.role);
    setError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formDisplayName.trim()) {
      setError(t('validation.required'));
      return;
    }
    setSaving(true);
    setError('');

    try {
      let res: Response;
      if (editingUser) {
        const body: any = { display_name: formDisplayName, role: formRole };
        if (formPassword) body.password = formPassword;
        res = await fetch(`/api/users/${editingUser.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        if (!formUsername.trim() || !formPassword.trim()) {
          setError(t('validation.required'));
          setSaving(false);
          return;
        }
        res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: formUsername, display_name: formDisplayName, password: formPassword, role: formRole }),
        });
      }

      if (res.ok) {
        setDialogOpen(false);
        fetchUsers();
      } else {
        const data = await res.json();
        setError(data.error || t('common.error'));
      }
    } catch {
      setError(t('login.error.network'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (user: User) => {
    if (!confirm(t('user.confirmDelete'))) return;
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
      if (res.ok) fetchUsers();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">{t('user.title')}</h2>
        <Button onClick={openAdd} size="sm" className="bg-slate-900 hover:bg-slate-800">
          <Plus className="h-4 w-4 mr-1" /> {t('user.add')}
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs">{t('user.username')}</TableHead>
                  <TableHead className="text-xs">{t('user.displayName')}</TableHead>
                  <TableHead className="text-xs">{t('user.role')}</TableHead>
                  <TableHead className="text-xs">{t('user.status')}</TableHead>
                  <TableHead className="text-xs">{t('user.createdAt')}</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                    ))}</TableRow>
                  ))
                ) : users.length > 0 ? (
                  users.map((u) => (
                    <TableRow key={u.id} className="hover:bg-slate-50">
                      <TableCell className="text-xs font-mono">{u.username}</TableCell>
                      <TableCell className="text-xs font-medium">{u.display_name}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-xs">{t(`role.${u.role}`)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={u.is_active ? 'default' : 'secondary'} className={`text-xs ${u.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}`}>
                          {u.is_active ? t('user.active') : t('user.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">{u.created_at?.split('T')[0]}</TableCell>
                      <TableCell className="text-xs text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(u)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {u.is_active && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => handleDeactivate(u)}>
                              <UserX className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-sm text-slate-400">{t('common.noData')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? t('user.edit') : t('user.add')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="space-y-2">
              <Label>{t('user.username')}</Label>
              <Input
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                disabled={!!editingUser}
                placeholder={t('user.username')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('user.displayName')}</Label>
              <Input
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                placeholder={t('user.displayName')}
              />
            </div>
            <div className="space-y-2">
              <Label>{editingUser ? t('user.resetPassword') : t('login.password')}</Label>
              <Input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={editingUser ? 'Leave blank to keep current' : t('login.password')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('user.role')}</Label>
              <Select value={formRole} onValueChange={setFormRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{t(`role.${r}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('action.cancel')}</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-slate-900 hover:bg-slate-800">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {t('action.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
