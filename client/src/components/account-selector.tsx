import { useQuery, useMutation } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Wallet, CreditCard, Loader2 } from "lucide-react";
import { useState } from "react";
import { type Account, type InsertAccount } from "@shared/schema";

export function AccountSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [newAccount, setNewAccount] = useState<InsertAccount>({
    name: "",
    type: "budget",
    initialBalance: 0,
    color: "#0d9488"
  });

  const { data: accounts, isLoading: accLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: currentAcc, isLoading: currentLoading } = useQuery<Account>({
    queryKey: ["/api/accounts/current"],
  });

  const switchMutation = useMutation({
    mutationFn: async (accountId: number) => {
      await apiRequest("PUT", "/api/settings", { currentAccountId: accountId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budget-period"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
    }
  });

  const createMutation = useMutation({
    mutationFn: async (acc: InsertAccount) => {
      const res = await apiRequest("POST", "/api/accounts", acc);
      const data = await res.json();
      await switchMutation.mutateAsync(data.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      setIsOpen(false);
      setNewAccount({ name: "", type: "budget", initialBalance: 0, color: "#0d9488" });
    }
  });

  if (accLoading || currentLoading) return <div className="h-10 w-32 bg-muted animate-pulse rounded-md" />;

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentAcc?.id?.toString()}
        onValueChange={(val) => switchMutation.mutate(parseInt(val))}
      >
        <SelectTrigger className="w-[140px] h-9 bg-background/50 backdrop-blur-sm border-primary/20">
          <SelectValue placeholder="계좌 선택" />
        </SelectTrigger>
        <SelectContent>
          {accounts?.map((acc) => (
            <SelectItem key={acc.id} value={acc.id.toString()}>
              <div className="flex items-center gap-2">
                <div 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: acc.color }} 
                />
                {acc.name}
              </div>
            </SelectItem>
          ))}
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" className="w-full justify-start text-xs h-8 px-2">
                <Plus className="w-3 h-3 mr-1" /> 계좌 추가
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>새 가계부 추가</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>가계부 이름</Label>
                  <Input 
                    placeholder="예: 생활비, 비상금, 저축" 
                    value={newAccount.name}
                    onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>스타일</Label>
                  <RadioGroup 
                    value={newAccount.type} 
                    onValueChange={(val: any) => setNewAccount({ ...newAccount, type: val })}
                    className="grid grid-cols-2 gap-4"
                  >
                    <div>
                      <RadioGroupItem value="budget" id="budget" className="peer sr-only" />
                      <Label
                        htmlFor="budget"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                      >
                        <Wallet className="mb-3 h-6 w-6" />
                        월 예산형
                      </Label>
                    </div>
                    <div>
                      <RadioGroupItem value="ledger" id="ledger" className="peer sr-only" />
                      <Label
                        htmlFor="ledger"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                      >
                        <CreditCard className="mb-3 h-6 w-6" />
                        잔고 관리형
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                {newAccount.type === "ledger" && (
                  <div className="space-y-2">
                    <Label>초기 잔액 (원)</Label>
                    <Input 
                      type="number"
                      value={newAccount.initialBalance}
                      onChange={(e) => setNewAccount({ ...newAccount, initialBalance: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button 
                  onClick={() => createMutation.mutate(newAccount)}
                  disabled={!newAccount.name || createMutation.isPending}
                >
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  추가하기
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </SelectContent>
      </Select>
    </div>
  );
}
