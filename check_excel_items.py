import openpyxl
import sys

def main():
    try:
        wb = openpyxl.load_workbook('TEMPLATE_PEDIDOS_PREENCHIDO_COPY.xlsx', data_only=True)
        sheet = wb.active
    except Exception as e:
        print(f"Error reading excel: {e}")
        return

    headers = {cell.value: idx for idx, cell in enumerate(sheet[1])}
    pedido_col = headers.get('NÚMERO DO PEDIDO (1, 2, 3 OU 4)')
    total_col = headers.get('VALOR TOTAL_1', headers.get(' VALOR TOTAL ', headers.get('VALOR TOTAL')))
    item_col = headers.get('ITEM')

    items_14 = []
    items_15 = []

    for row in list(sheet.rows)[1:]:
        pedido_val = row[pedido_col].value if pedido_col is not None else None
        
        if pedido_val is None: continue
            
        try:
            p = float(pedido_val)
        except ValueError: continue
            
        if 1 <= p <= 4:
            pedido_idx = int(p) + 13
            val = row[total_col].value if total_col is not None else 0
            
            try:
                if type(val) == str:
                    val = float(val.replace('.', '').replace(',', '.'))
                elif val is None:
                    val = 0
                else:
                    val = float(val)
            except ValueError:
                val = 0
                
            item_desc = row[item_col].value if item_col is not None else "UNKNOWN"
            if pedido_idx == 14:
                items_14.append((item_desc, val))
            elif pedido_idx == 15:
                items_15.append((item_desc, val))

    print("TOP 5 items by value in order 14 (Excel):")
    for desc, val in sorted(items_14, key=lambda x: x[1], reverse=True)[:5]:
        print(f"R$ {val:.2f} - {desc}")
        
    print("\nTOP 5 items by value in order 15 (Excel):")
    for desc, val in sorted(items_15, key=lambda x: x[1], reverse=True)[:5]:
        print(f"R$ {val:.2f} - {desc}")

if __name__ == '__main__':
    main()
