import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface BillingItem {
  item_name: string;
  unit_price: number;
  quantity: number;
  total_cost: number;
  date: string;
}

interface GroupedBillingData {
  [date: string]: {
    items: BillingItem[];
    subtotal: number;
  };
}

function formatLocalDate(date:any, options = {}) {
  return new Date(date).toLocaleDateString('en-PK', {
    timeZone: 'Asia/Karachi',  // <-- Ensure PKT
    ...options,
  });
}


const formatCurrency = (amount: number) => {
  return amount.toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

interface BillingTableProps {
  groupedBillingData: GroupedBillingData;
}

export function BillingTable({ groupedBillingData }: BillingTableProps) {
  if (Object.keys(groupedBillingData).length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No meal data found for the selected month</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {Object.entries(groupedBillingData)
        .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
        .map(([date, data]) => (
          <div key={date} className="border rounded-lg p-4 bg-white shadow-sm">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
              <h3 className="text-base font-semibold text-gray-800">
                {formatLocalDate(date, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </h3>
              <Badge
                variant="outline"
                className="text-sm w-fit bg-[#A2BD9D]/10 text-[#A2BD9D] border-[#A2BD9D]/20"
              >
                Subtotal: ₨{formatCurrency(data.subtotal)}
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#A2BD9D]/5">
                    <TableHead className="text-xs font-semibold text-[#A2BD9D]">Item Name</TableHead>
                    <TableHead className="text-xs font-semibold text-[#A2BD9D]">Unit Price (PKR)</TableHead>
                    <TableHead className="text-xs font-semibold text-[#A2BD9D]">Quantity</TableHead>
                    <TableHead className="text-xs font-semibold text-[#A2BD9D]">Total Cost (PKR)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item, index) => (
                    <TableRow key={index} className="hover:bg-[#A2BD9D]/5">
                      <TableCell className="font-medium text-sm text-gray-800">{item.item_name}</TableCell>
                      <TableCell className="text-sm text-gray-600">
                        ₨{formatCurrency(item.unit_price)}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{item.quantity}</TableCell>
                      <TableCell className="text-sm font-medium text-gray-800">
                        ₨{formatCurrency(item.total_cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
    </div>
  );
}
