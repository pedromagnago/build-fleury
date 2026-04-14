import openpyxl
import sys

def main():
    print("Reading excel...", flush=True)
    try:
        wb = openpyxl.load_workbook('TEMPLATE_PEDIDOS_PREENCHIDO_COPY.xlsx', data_only=True)
        sheet = wb.active
    except Exception as e:
        print(f"Error reading excel: {e}")
        return

    expected_total = 0
    headers = {cell.value: idx for idx, cell in enumerate(sheet[1])}
    
    pedido_col = headers.get('NÚMERO DO PEDIDO (1, 2, 3 OU 4)')
    total_col = headers.get('VALOR TOTAL_1', headers.get(' VALOR TOTAL ', headers.get('VALOR TOTAL')))

    counts = {14: 0, 15: 0, 16: 0, 17: 0}
    sums = {14: 0, 15: 0, 16: 0, 17: 0}

    for row in list(sheet.rows)[1:]:
        pedido_val = row[pedido_col].value if pedido_col is not None else None
        
        if pedido_val is None:
            continue
            
        try:
            p = float(pedido_val)
        except ValueError:
            continue
            
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
                
            expected_total += val
            sums[pedido_idx] += val
            counts[pedido_idx] += 1

    print(f"Expected Total: {expected_total:.3f}")
    for k in sums:
        print(f"Pedido {k}: count={counts[k]}, sum={sums[k]:.3f}")

if __name__ == '__main__':
    main()
