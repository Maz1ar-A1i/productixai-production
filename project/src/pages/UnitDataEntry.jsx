import React, { useState, useEffect, useMemo } from "react";
import { Save, Plus, Trash2, ClipboardPaste, Calendar, CheckCircle2, AlertCircle, DollarSign, TrendingUp, Activity } from "lucide-react";
import api, { formulaService, alertService, dataRecordService, productService, authService } from "../services/api";
import { ValidationResultDisplay } from "../components/AlertNotification";

const excelSerialToDate = (serial) => {
  const s = parseInt(serial, 10);
  if (isNaN(s)) return "";
  const date = new Date(Date.UTC(1899, 11, 30) + s * 24 * 60 * 60 * 1000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const normalizeDate = (val) => {
  if (!val || typeof val !== "string") return "";
  let cleaned = val.trim().toLowerCase().replace(/^'|'$/g, "").replace(/[\u2013\u2014]/g, "-");
  if (!cleaned) return "";

  // If it doesn't contain any month word, and contains a space (likely time part), take the first part
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const hasMonthWord = monthNames.some(m => cleaned.includes(m));
  if (!hasMonthWord && cleaned.includes(" ")) {
    cleaned = cleaned.split(" ")[0];
  }

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // Check if it's a 5-digit Excel serial date
  if (/^\d{5}$/.test(cleaned)) {
    const sVal = parseInt(cleaned, 10);
    if (sVal >= 40000 && sVal <= 60000) {
      return excelSerialToDate(cleaned);
    }
  }

  // 1. Check for YYYY/MM/DD or YYYY-MM-DD or YYYY.MM.DD
  let match = cleaned.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (match) {
    const [_, y, m, d] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // 2. Check for DD/MM/YYYY or MM/DD/YYYY or DD.MM.YYYY
  match = cleaned.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (match) {
    let [_, p1, p2, p3] = match;
    let y = p3;
    if (y.length === 2) {
      const currentYear = new Date().getFullYear();
      const century = Math.floor(currentYear / 100) * 100;
      y = String(century + parseInt(y, 10));
    }
    const num1 = parseInt(p1, 10);
    const num2 = parseInt(p2, 10);
    let d, m;
    if (num1 > 12 && num2 <= 12) {
      d = String(num1);
      m = String(num2);
    } else if (num2 > 12 && num1 <= 12) {
      d = String(num2);
      m = String(num1);
    } else {
      // Default to DD/MM/YYYY
      d = String(num1);
      m = String(num2);
    }
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // 3. Check for 2-part dates like DD/MM or DD-MM (assumes current year)
  match = cleaned.match(/^(\d{1,2})[\/\-\.](\d{1,2})$/);
  if (match) {
    const [_, p1, p2] = match;
    const y = String(new Date().getFullYear());
    const num1 = parseInt(p1, 10);
    const num2 = parseInt(p2, 10);
    let d, m;
    if (num1 > 12 && num2 <= 12) {
      d = String(num1);
      m = String(num2);
    } else if (num2 > 12 && num1 <= 12) {
      d = String(num2);
      m = String(num1);
    } else {
      // Default to DD/MM
      d = String(num1);
      m = String(num2);
    }
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // 4. Check for word months, e.g. "24-Jun-26", "24 Jun 2026", "Jun 24, 2026", "June 24, 2026"
  let foundMonthIndex = -1;
  let foundMonthName = "";
  for (let idx = 0; idx < monthNames.length; idx++) {
    if (cleaned.includes(monthNames[idx])) {
      foundMonthIndex = idx;
      foundMonthName = monthNames[idx];
      break;
    }
  }

  if (foundMonthIndex !== -1) {
    const nums = cleaned.replace(foundMonthName, "").match(/\d+/g);
    if (nums && nums.length >= 1) {
      let d = "";
      let y = "";
      if (nums.length === 1) {
        // Only 1 number, e.g. "24-Jun" or "Jun-24"
        d = nums[0];
        y = String(new Date().getFullYear());
      } else {
        // 2 or more numbers
        if (nums[0].length === 4) {
          y = nums[0];
          d = nums[1];
        } else if (nums[1].length === 4) {
          y = nums[1];
          d = nums[0];
        } else {
          d = nums[0];
          y = nums[1];
          if (y.length === 2) {
            const currentYear = new Date().getFullYear();
            const century = Math.floor(currentYear / 100) * 100;
            y = String(century + parseInt(y, 10));
          }
        }
      }
      const m = String(foundMonthIndex + 1).padStart(2, '0');
      return `${y}-${m}-${d.padStart(2, '0')}`;
    }
  }

  // Fallback to JS parsing
  const parsed = Date.parse(val);
  if (!isNaN(parsed)) {
    const dObj = new Date(parsed);
    const y = dObj.getFullYear();
    const m = String(dObj.getMonth() + 1).padStart(2, '0');
    const d = String(dObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return val;
};

const UnitDataEntry = () => {
  const userRole = authService.getRole();
  const isReadOnly = userRole === "org_admin";

  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("all");

  const [units, setUnits] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  
  const [unitColumns, setUnitColumns] = useState([]);
  const [customerColumns, setCustomerColumns] = useState([]);
  
  const [unitRows, setUnitRows] = useState([]);
  const [customerRows, setCustomerRows] = useState([]);
  
  const [formulas, setFormulas] = useState([]);

  const [message, setMessage] = useState({ type: "", text: "" });
  const [validationResult, setValidationResult] = useState(null);
  const [showValidation, setShowValidation] = useState(false);

  const [colMap, setColMap] = useState({});
  const [selectedDate, setSelectedDate] = useState("");
  const [showAllFormulas, setShowAllFormulas] = useState(true);
  const [visibleFormulaIds, setVisibleFormulaIds] = useState([]);

  const runCalculations = (row, type, formulasList = formulas, uRows = unitRows, uCols = unitColumns, cCols = customerColumns) => {
    const updatedRow = { ...row };
    const cols = type === "unit" ? uCols : cCols;

    // Build a dual-key context:
    // Each column contributes TWO keys — its display label AND its original variable name.
    // The original name is encoded in the key: 'unit_Fuel Cost' → 'Fuel Cost'
    const context = {};
    const buildContext = (colList, dataRow) => {
      colList.forEach(c => {
        if (c.key === "Date" || c.key === "Customer") return;
        const val = Number(dataRow[c.key] || 0);
        // Key 1: display label (may be renamed)
        context[c.label] = val;
        // Key 2: original variable name extracted from key (e.g. 'unit_Fuel Cost' → 'Fuel Cost')
        const originalName = c.key.replace(/^unit_|^customer_/, "");
        if (originalName !== c.label) context[originalName] = val;
      });
    };
    buildContext(cols, updatedRow);

    // Helper: find the column that is the target of a formula.
    const findTargetCol = (colList, formulaName, targetColName) => {
      if (targetColName) {
        const byTarget = colList.find(c => {
          if (c.label === targetColName) return true;
          const originalName = c.key.replace(/^unit_|^customer_/, "");
          return originalName === targetColName;
        });
        if (byTarget) return byTarget;
      }
      return colList.find(c => {
        if (c.label === formulaName) return true;
        const originalName = c.key.replace(/^unit_|^customer_/, "");
        return originalName === formulaName;
      });
    };

    // Helper: resolve a variable from the context, or look up unit-level data for customer rows.
    const resolveVar = (v, rowData, rowType) => {
      const cleanV = v.replace(/\s*\(Revenue\)|\s*\(Customer\)/i, "");
      if (context[cleanV] !== undefined) return context[cleanV];
      if (rowType === "customer" && rowData.Date) {
        const unitRow = uRows.find(ur => ur.Date === rowData.Date);
        if (unitRow) {
          const uCol = uCols.find(uc => uc.label === cleanV || uc.key.replace(/^unit_/, "") === cleanV);
          if (uCol) return Number(unitRow[uCol.key] || 0);
        }
      }
      return undefined;
    };

    // Evaluate each formula whose target column exists in this table
    formulasList.forEach(f => {
      const targetCol = findTargetCol(cols, f.formula_name, f.target_column);
      if (!targetCol) return;

      let expr = f.expression_string;
      const requiredVars = [...expr.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);

      let canEval = true;
      requiredVars.forEach(v => {
        const val = resolveVar(v, updatedRow, type);
        if (val === undefined) {
          canEval = false;
        } else {
          expr = expr.replaceAll(`[${v}]`, val);
        }
      });

      if (canEval) {
        try {
          // eslint-disable-next-line no-eval
          const result = eval(expr);
          updatedRow[targetCol.key] = isNaN(result) || !isFinite(result) ? "" : Number(result.toFixed(2));
          context[f.formula_name] = Number(updatedRow[targetCol.key]);
          const originalTarget = targetCol.key.replace(/^unit_|^customer_/, "");
          if (originalTarget !== f.formula_name) context[originalTarget] = context[f.formula_name];
        } catch (e) { /* ignore evaluation errors silently */ }
      }
    });

    return updatedRow;
  };

  // Load configured users & formulas
  useEffect(() => {
    try { setColMap(JSON.parse(localStorage.getItem("telco_unit_col_map") || "{}")); } catch {}

    api.get("/organizations/me")
      .then(res => {
        if (res.data && res.data.column_mappings) {
          setColMap(res.data.column_mappings);
          localStorage.setItem("telco_unit_col_map", JSON.stringify(res.data.column_mappings));
        }
      })
      .catch(err => console.error("Failed to load organization mappings in UnitDataEntry:", err));

    if (userRole === "org_admin") {
      api.get("/users/")
        .then(res => {
          const operators = res.data.filter(u => u.role === "org_user" || u.role === "org_admin");
          setUsers(operators);
        })
        .catch(err => console.error("Failed to load users", err));
    }

    formulaService.list()
      .then(res => {
        setFormulas(res.data);
        setVisibleFormulaIds(res.data.map(f => f.id));
      })
      .catch(err => console.error("Failed to load formulas", err));
  }, [userRole]);

  // Load units whenever selectedUserId changes
  useEffect(() => {
    let fetchPromise;
    if (userRole === "org_admin" && selectedUserId !== "all") {
      fetchPromise = api.get(`/users/${selectedUserId}/assigned-units`);
    } else {
      fetchPromise = productService.getProducts();
    }

    fetchPromise
      .then(res => {
        const dbUnits = res.data.map(p => ({
          id: p.id,
          name: p.name,
          city: p.description || "",
          region: p.region || p.description || "",
          location: p.location || "Urban",
          customers: p.customers || [],
          unit_vars: p.unit_vars || [],
          customer_vars: p.customer_vars || []
        }));
        setUnits(dbUnits);
        if (dbUnits.length > 0) {
          setSelectedUnitId(dbUnits[0].id);
        } else {
          setSelectedUnitId("");
          setUnitRows([]);
          setCustomerRows([]);
        }
      })
      .catch(err => {
        console.error("Failed to load units:", err);
        setUnits([]);
        setSelectedUnitId("");
        setUnitRows([]);
        setCustomerRows([]);
      });
  }, [selectedUserId, userRole]);

  // Re-load data records whenever selectedUnitId changes
  useEffect(() => {
    if (selectedUnitId && units.length > 0) {
      handleSelectUnit(selectedUnitId, units);
    }
  }, [selectedUnitId]);

  const handleSelectUnit = (id, unitList = units) => {
    setSelectedUnitId(id);
    const unit = unitList.find(u => String(u.id) === String(id));
    if (!unit) return;

    let currentMap = {};
    try { currentMap = JSON.parse(localStorage.getItem("telco_unit_col_map") || "{}"); } catch {}
    setColMap(currentMap);

    // Generate Unit schema
    const uniCols = [{ key: "Date", label: "Date", type: "date" }];
    (unit.unit_vars || []).forEach(v => {
      uniCols.push({ key: `unit_${v}`, label: currentMap[v] || v });
    });
    setUnitColumns(uniCols);

    // Generate Customer schema
    const custCols = [
      { key: "Date", label: "Date", type: "date" },
      { key: "Customer", label: "Select Customer", type: "dropdown", options: unit.customers || [] }
    ];
    (unit.customer_vars || []).forEach(v => {
      custCols.push({ key: `customer_${v}`, label: currentMap[v] || v });
    });
    setCustomerColumns(custCols);

    // Fetch existing records from database
    dataRecordService.getRecords(id)
      .then(res => {
        const dbRecords = res.data || [];
        if (dbRecords.length > 0) {
          const uRows = [];
          const cRows = [];
          
          dbRecords.forEach(rec => {
            const canon = rec.data || {};
            const params = canon.parameters || {};
            const dateVal = params.date || rec.month;
            
            // Reconstruct Unit Row
            const uRow = { id: rec.id, Date: dateVal };
            const uData = canon.unit_data || {};
            (unit.unit_vars || []).forEach(v => {
              const displayName = currentMap[v] || v;
              uRow[`unit_${v}`] = uData[displayName] !== undefined ? uData[displayName] : (uData[v] !== undefined ? uData[v] : "");
            });
            // Add any computed fields that might map to unit columns
            const compData = canon.computed || {};
            (unit.unit_vars || []).forEach(v => {
              const displayName = currentMap[v] || v;
              if (uRow[`unit_${v}`] === "") {
                if (compData[displayName] !== undefined) {
                  uRow[`unit_${v}`] = compData[displayName];
                } else if (compData[v] !== undefined) {
                  uRow[`unit_${v}`] = compData[v];
                }
              }
            });
            uRows.push(uRow);
            
            // Reconstruct Customer Rows
            const custData = canon.customer_data || [];
            custData.forEach(cust => {
              const cRow = { id: Math.random(), Date: dateVal, Customer: cust.name };
              (unit.customer_vars || []).forEach(v => {
                const displayName = currentMap[v] || v;
                cRow[`customer_${v}`] = cust[displayName] !== undefined ? cust[displayName] : (cust[v] !== undefined ? cust[v] : "");
              });
              cRows.push(cRow);
            });
          });
          
          const finalURows = uRows.length > 0 ? uRows : [createEmptyRow(uniCols)];
          const finalCRows = cRows.length > 0 ? cRows : [createEmptyRow(custCols)];
          
          setUnitRows(finalURows.map(r => runCalculations(r, "unit", formulas, finalURows, uniCols, custCols)));
          setCustomerRows(finalCRows.map(r => runCalculations(r, "customer", formulas, finalURows, uniCols, custCols)));
        } else {
          // Check if we have localStorage draft
          let loadedDraft = false;
          try {
            const allData = JSON.parse(localStorage.getItem("telco_unit_data_v2") || "{}");
            const localDraft = allData[id];
            if (localDraft && (localDraft.unitRows?.length > 0 || localDraft.customerRows?.length > 0)) {
              setUnitRows(localDraft.unitRows.map(r => runCalculations(r, "unit", formulas, localDraft.unitRows, uniCols, custCols)));
              setCustomerRows(localDraft.customerRows.map(r => runCalculations(r, "customer", formulas, localDraft.unitRows, uniCols, custCols)));
              loadedDraft = true;
            }
          } catch (e) {
            console.error("LS draft load failed", e);
          }

          if (!loadedDraft) {
            // Fallback to empty rows
            const ur = [createEmptyRow(uniCols)];
            const cr = [createEmptyRow(custCols)];
            setUnitRows(ur.map(r => runCalculations(r, "unit", formulas, ur, uniCols, custCols)));
            setCustomerRows(cr.map(r => runCalculations(r, "customer", formulas, ur, uniCols, custCols)));
          }
        }
      })
      .catch(err => {
        console.error("Failed to load records from DB, trying local draft:", err);
        let loadedDraft = false;
        try {
          const allData = JSON.parse(localStorage.getItem("telco_unit_data_v2") || "{}");
          const localDraft = allData[id];
          if (localDraft && (localDraft.unitRows?.length > 0 || localDraft.customerRows?.length > 0)) {
            setUnitRows(localDraft.unitRows.map(r => runCalculations(r, "unit", formulas, localDraft.unitRows, uniCols, custCols)));
            setCustomerRows(localDraft.customerRows.map(r => runCalculations(r, "customer", formulas, localDraft.unitRows, uniCols, custCols)));
            loadedDraft = true;
          }
        } catch (e) {
          console.error("LS draft load failed in catch", e);
        }

        if (!loadedDraft) {
          const ur = [createEmptyRow(uniCols)];
          const cr = [createEmptyRow(custCols)];
          setUnitRows(ur.map(r => runCalculations(r, "unit", formulas, ur, uniCols, custCols)));
          setCustomerRows(cr.map(r => runCalculations(r, "customer", formulas, ur, uniCols, custCols)));
        }
      });
    setSelectedDate("");
  };

  const createEmptyRow = (cols) => {
    const row = { id: `empty_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` };
    cols.forEach(c => { 
      row[c.key] = c.key === "Customer" && c.options && c.options.length > 0 ? c.options[0] : ""; 
    });
    return row;
  };


  const addRow = (type) => {
    if (type === "unit") setUnitRows([...unitRows, createEmptyRow(unitColumns)]);
    else setCustomerRows([...customerRows, createEmptyRow(customerColumns)]);
  };

  const removeRow = (index, type) => {
    if (type === "unit") {
      const newRows = [...unitRows];
      newRows.splice(index, 1);
      if (newRows.length === 0) newRows.push(createEmptyRow(unitColumns));
      setUnitRows(newRows);
    } else {
      const newRows = [...customerRows];
      newRows.splice(index, 1);
      if (newRows.length === 0) newRows.push(createEmptyRow(customerColumns));
      setCustomerRows(newRows);
    }
  };

  const handleCellChange = (index, key, value, type) => {
    if (type === "unit") {
      setUnitRows(prev => {
        const newRows = [...prev];
        newRows[index] = { ...newRows[index], [key]: value };
        newRows[index] = runCalculations(newRows[index], "unit", formulas, newRows, unitColumns, customerColumns);
        
        if (key === "Date") {
           setCustomerRows(cPrev => cPrev.map(cr => cr.Date === value ? runCalculations(cr, "customer", formulas, newRows, unitColumns, customerColumns) : cr));
        }
        return newRows;
      });
    } else {
      setCustomerRows(prev => {
        const newRows = [...prev];
        newRows[index] = { ...newRows[index], [key]: value };
        newRows[index] = runCalculations(newRows[index], "customer", formulas, unitRows, unitColumns, customerColumns);
        return newRows;
      });
    }
  };

  const handlePaste = (e, type) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("Text");
    processPasteData(pasteData, type);
  };

  const processPasteData = (pasteData, type) => {
    if (!pasteData || !pasteData.trim()) return;

    const cols = type === "unit" ? unitColumns : customerColumns;

    // Normalize line endings: Excel uses \r\n on Windows, Google Sheets uses \n
    const normalized = pasteData.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n").filter(line => line.trim() !== "");

    if (lines.length === 0) return;

    const newRows = lines.map((line, idx) => {
      // Split by tab, strip surrounding whitespace and stray \r from each cell
      const values = line.split("\t").map(v => v.trim().replace(/\r/g, ""));
      const row = { id: `paste_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}` };
      cols.forEach((c, i) => {
        let val = values[i] !== undefined ? values[i] : "";
        if (c.type === "date") {
          val = normalizeDate(val);
        }
        row[c.key] = val;
      });
      return row;
    });

    if (type === "unit") {
      setUnitRows(prev => {
        // Remove empty placeholder rows (rows where all data columns are empty)
        const filtered = prev.filter(r =>
          cols.filter(c => c.key !== "Date").some(c => r[c.key] !== "" && r[c.key] !== undefined)
        );
        const combined = [...filtered, ...newRows];
        return combined.map(r => runCalculations(r, "unit", formulas, combined, unitColumns, customerColumns));
      });
    } else {
      setCustomerRows(prev => {
        const filtered = prev.filter(r =>
          cols.filter(c => c.key !== "Date" && c.key !== "Customer").some(c => r[c.key] !== "" && r[c.key] !== undefined)
        );
        const combined = [...filtered, ...newRows];
        return combined.map(r => runCalculations(r, "customer", formulas, unitRows, unitColumns, customerColumns));
      });
    }
    const firstRowDebug = newRows[0] ? Object.entries(newRows[0]).filter(([k]) => k !== 'id').map(([k, v]) => `${k}: "${v}"`).join(", ") : "none";
    showMsg("success", `Pasted ${newRows.length} rows. First row values: ${firstRowDebug}`);
  };

  const handlePasteButton = async (type) => {
    try {
      const text = await navigator.clipboard.readText();
      processPasteData(text, type);
    } catch (err) {
      showMsg("error", "Could not read clipboard. Try clicking inside the table and pressing Ctrl+V.");
    }
  };


  const saveUnitData = async (forceSave = false) => {
    try {
      const unitData = unitRows.reduce((acc, row) => {
        Object.keys(row).forEach(key => {
          if (key.startsWith('unit_')) {
            acc[key] = row[key];
          }
        });
        return acc;
      }, {});

      // Use backend validation for unit/customer data (validateTowerData mapping in api.js)
      const validation = await alertService.validateTowerData(unitData, customerRows);
      setValidationResult(validation.data);

      if (!validation.data.is_valid && !forceSave) {
        setShowValidation(true);
        return;
      }

      // Save to localStorage as local cache/draft
      const allData = JSON.parse(localStorage.getItem("telco_unit_data_v2") || "{}");
      allData[selectedUnitId] = { unitRows, customerRows };
      localStorage.setItem("telco_unit_data_v2", JSON.stringify(allData));

      // Push to database via unified bulk record endpoint
      const unitObj = units.find(u => String(u.id) === String(selectedUnitId));
      const payload = {
        tower_id: isNaN(Number(selectedUnitId)) ? 0 : Number(selectedUnitId),
        tower_name: unitObj?.name || selectedUnitId,
        city: unitObj?.city || "",
        region: unitObj?.region || unitObj?.city || "",
        unit_rows: unitRows,
        customer_rows: customerRows,
        col_map: colMap
      };

      await dataRecordService.bulkCreate(payload);

      showMsg("success", "Data saved successfully to database!");
      setShowValidation(false);
    } catch (error) {
      console.error('Save error:', error);
      showMsg("error", "Failed to save data to database.");
    }
  };

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 4000);
  };

  const availableDates = useMemo(() => {
    const dates = new Set();
    unitRows.forEach(r => r.Date && dates.add(r.Date));
    customerRows.forEach(r => r.Date && dates.add(r.Date));
    return Array.from(dates).sort((a, b) => new Date(b) - new Date(a));
  }, [unitRows, customerRows]);

  const evaluatedFormulas = useMemo(() => {
    if (!selectedDate || formulas.length === 0) return [];

    const unitData = unitRows.find(r => r.Date === selectedDate) || {};
    const uVars = {};
    unitColumns.forEach(c => {
      if (c.key.startsWith('unit_')) {
        const val = Number(unitData[c.key] || 0);
        uVars[c.label] = val;
        const origName = c.key.replace(/^unit_/, "");
        if (origName !== c.label) uVars[origName] = val;
      }
    });

    const custData = customerRows.filter(r => r.Date === selectedDate);
    const customerVars = {};
    custData.forEach(row => {
      const customer = row.Customer;
      if (!customer) return;
      customerVars[customer] = {};
      customerColumns.forEach(c => {
        if (c.key.startsWith('customer_')) {
          const val = Number(row[c.key] || 0);
          customerVars[customer][c.label] = val;
          const origName = c.key.replace(/^customer_/, "");
          if (origName !== c.label) customerVars[customer][origName] = val;
        }
      });
    });

    const isKnownVar = (v) => {
      const cleanV = v.replace(/\s*\(Revenue\)|\s*\(Customer\)/i, "");
      return unitColumns.some(uc => uc.label === cleanV || uc.key.replace(/^unit_/, "") === cleanV) ||
             customerColumns.some(cc => cc.label === cleanV || cc.key.replace(/^customer_/, "") === cleanV);
    };

    return formulas.map(f => {
      const expr = f.expression_string;
      if (!expr) return { ...f, success: false, error: "Empty expression" };

      const requiredVars = [...expr.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);

      const missingVars = requiredVars.filter(v => !isKnownVar(v));
      if (missingVars.length > 0) {
        return { ...f, success: false, error: `Missing variables: ${missingVars.join(', ')}` };
      }

      const isCustomerFormula = requiredVars.some(v =>
        customerColumns.some(cc => cc.label === v || cc.key.replace(/^customer_/, "") === v)
      );
      let resultObj = { ...f, isCustomerFormula, success: false };

      if (isCustomerFormula) {
        const customerResults = {};
        if (Object.keys(customerVars).length === 0) {
          return { ...f, success: false, error: "No customer data entered" };
        }

        Object.keys(customerVars).forEach(customer => {
          let evalStr = expr;
          let canEval = true;
          requiredVars.forEach(v => {
            let val = customerVars[customer][v];
            if (val === undefined) val = uVars[v];
            if (val === undefined) { canEval = false; return; }
            evalStr = evalStr.replaceAll(`[${v}]`, val);
          });
          if (canEval) {
            try { customerResults[customer] = eval(evalStr); } catch (e) { customerResults[customer] = "Err"; }
          }
        });

        let globalEvalStr = expr;
        let canGlobalEval = true;
        requiredVars.forEach(v => {
          const val = uVars[v];
          if (val === undefined) { canGlobalEval = false; return; }
          globalEvalStr = globalEvalStr.replaceAll(`[${v}]`, val);
        });
        if (canGlobalEval) {
          try { resultObj.globalResult = eval(globalEvalStr); } catch (e) { resultObj.globalResult = "Err"; }
        }

        if (Object.keys(customerResults).length > 0) {
          resultObj.customerResults = customerResults;
          resultObj.success = true;
        } else {
          resultObj.error = "Could not evaluate for any customer";
        }
      } else {
        let evalStr = expr;
        let canEval = true;
        requiredVars.forEach(v => {
          const val = uVars[v];
          if (val === undefined) { canEval = false; return; }
          evalStr = evalStr.replaceAll(`[${v}]`, val);
        });
        if (canEval) {
          try {
            resultObj.globalResult = eval(evalStr);
            resultObj.success = true;
          } catch (e) {
            resultObj.success = false;
            resultObj.error = "Math Error";
          }
        } else {
          resultObj.error = "Variables missing in data";
        }
      }
      return resultObj;
    });
  }, [selectedDate, formulas, unitRows, customerRows, unitColumns, customerColumns]);

  const filteredEvaluatedFormulas = useMemo(() => {
    if (showAllFormulas) return evaluatedFormulas;
    return evaluatedFormulas.filter(f => visibleFormulaIds.includes(f.id));
  }, [evaluatedFormulas, showAllFormulas, visibleFormulaIds]);

  const toggleFormulaVisibility = (id) => {
    setVisibleFormulaIds(prev => 
      prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
    );
  };

  const formatOutput = (val, type) => {
    if (val === "Err" || isNaN(val)) return "N/A";
    if (type === "percentage") return `${(val).toFixed(2)}%`;
    if (type === "currency") return `$${Number(val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    return Number(val).toLocaleString(undefined, {maximumFractionDigits: 2});
  };

  const getOutputIcon = (type) => {
    if (type === "currency") return <DollarSign size={18} className="text-emerald-500" />;
    if (type === "percentage") return <Activity size={18} className="text-blue-500" />;
    return <TrendingUp size={18} className="text-purple-500" />;
  };

  const selectedUnitObj = units.find(u => String(u.id) === String(selectedUnitId));

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)", padding: "32px" }}>
      
      {message.text && (
        <div className={`fixed top-8 right-8 z-[100] p-4 rounded-xl border flex items-center gap-3 animate-in slide-in-from-right ${
          message.type === "success" ? "bg-teal-500/10 border-teal-500 text-teal-500" : "bg-red-500/10 border-red-500 text-red-500"
        }`}>
          {message.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="font-semibold text-sm">{message.text}</span>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-4xl font-black mb-2 tracking-tight" style={{ color: "var(--text-primary)" }}>
          Operational Data Entry & Insights
        </h1>
        <p style={{ color: "var(--text-secondary)" }} className="text-base">
          Manage operational records and view dynamic daily formula outputs.
        </p>
      </div>

      <div className="glass-card p-6 mb-8 flex flex-wrap items-end gap-6">
        {userRole === "org_admin" && (
          <div className="w-full md:w-1/3">
            <label className="text-xs font-black text-white/40 uppercase mb-2 block">Filter by Operator / User</label>
            <select 
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold outline-none focus:border-teal-500"
            >
              <option value="all">All Operators</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name || u.email} ({u.role})</option>
              ))}
            </select>
          </div>
        )}
        
        {selectedUnitObj && (
          <div className="flex-1 flex flex-wrap gap-4">
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-white">
              <span className="text-[10px] font-black uppercase opacity-40 block">Unit Name</span>
              <span className="font-bold">{selectedUnitObj.name} ({selectedUnitObj.city})</span>
            </div>
            <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-500">
              <span className="text-[10px] font-black uppercase opacity-60 block">Customers</span>
              <span className="font-bold">{(selectedUnitObj.customers || []).length} Active</span>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-white">
              <span className="text-[10px] font-black uppercase opacity-40 block">Tracking</span>
              <span className="font-bold">{(unitColumns.length - 1) + (customerColumns.length - 2)} Metrics</span>
            </div>
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-500">
              <span className="text-[10px] font-black uppercase opacity-60 block">Formulas</span>
              <span className="font-bold">{formulas.length} Available</span>
            </div>
          </div>
        )}

        {!isReadOnly && selectedUnitId && (
          <button onClick={() => saveUnitData(false)} className="btn-primary px-8 py-3 font-black flex items-center gap-2 h-fit">
            <Save size={18} /> SAVE RECORDS
          </button>
        )}
      </div>

      {units.length > 1 && (
        <div className="mb-8 p-2 rounded-2xl bg-white/2 border border-white/5 flex flex-wrap gap-2">
          {units.map(u => (
            <button
              key={u.id}
              onClick={() => setSelectedUnitId(u.id)}
              className={`px-5 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${
                String(selectedUnitId) === String(u.id)
                  ? "bg-teal-500 text-black shadow-lg shadow-teal-500/20"
                  : "bg-transparent text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              {u.name} ({u.city})
            </button>
          ))}
        </div>
      )}

      {showValidation && validationResult && (
        <div className="mb-8">
          <ValidationResultDisplay 
            validationResult={validationResult} 
            onProceed={() => saveUnitData(true)} 
          />
        </div>
      )}

      {selectedUnitId ? (
        <>
          {/* Daily Formula Dashboard removed per requirements */}

          <div className="grid grid-cols-1 gap-8">
            
            {/* UNIT TABLE */}
            <div className="glass-card overflow-hidden flex flex-col">
              <div className="p-4 border-b border-white/5 bg-white/2 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-white">Overall Unit Operations</h2>
                  <div className="flex items-center gap-2 mt-1 text-white/40">
                    <ClipboardPaste size={12} />
                    <span className="text-xs font-medium">Click inside table and press <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-white">Ctrl+V</kbd> to paste from Excel/Sheets.</span>
                  </div>
                </div>
                {!isReadOnly && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePasteButton("unit")}
                      className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white font-bold text-sm flex items-center gap-2 transition-all"
                    >
                      <ClipboardPaste size={14} /> PASTE DATA
                    </button>
                    <button onClick={() => addRow("unit")} className="px-4 py-2 rounded-lg bg-teal-500/10 text-teal-500 hover:bg-teal-500 hover:text-black font-bold text-sm flex items-center gap-2 transition-all">
                      <Plus size={16} /> ADD ROW
                    </button>
                  </div>
                )}
              </div>
              
              <div
                className="flex-1 overflow-auto custom-scrollbar max-h-[50vh]"
                tabIndex={0}
                onPaste={isReadOnly ? undefined : (e) => handlePaste(e, "unit")}
                style={{ outline: "none" }}
              >
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-[#121212] z-10 shadow-md">
                    <tr>
                      <th className="p-3 text-[10px] font-black uppercase tracking-widest text-white/30 border-b border-white/10 w-12 text-center">#</th>
                      {unitColumns.map(c => (
                        <th key={c.key} className="p-3 text-[10px] font-black uppercase tracking-wider text-teal-500/60 border-b border-white/10 whitespace-nowrap">
                          {c.label}
                        </th>
                      ))}
                      {!isReadOnly && <th className="p-3 border-b border-white/10 w-12"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {unitRows.map((row, rIndex) => (
                      <tr key={row.id} className="hover:bg-white/5 group border-b border-white/5 last:border-0 transition-colors">
                        <td className="p-2 text-center text-xs text-white/20 font-mono">{rIndex + 1}</td>
                        {unitColumns.map(c => {
                          const colOrigName = c.key.replace(/^unit_|^customer_/, "");
                          const isCalc = formulas.some(f =>
                            (f.target_column && (f.target_column === colOrigName || f.target_column === c.label)) ||
                            (!f.target_column && (f.formula_name === c.label || f.formula_name === colOrigName))
                          );
                          return (
                            <td key={c.key} className={`p-1 min-w-[150px] ${isCalc ? 'bg-teal-500/5' : ''}`}>
                              <input
                                type={c.type === "date" ? "date" : "text"}
                                value={row[c.key] || ""}
                                onChange={e => handleCellChange(rIndex, c.key, e.target.value, "unit")}
                                onPaste={isReadOnly || isCalc ? undefined : (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const text = e.clipboardData.getData("text");
                                  processPasteData(text, "unit");
                                }}
                                placeholder={isCalc ? "Auto" : "-"}
                                readOnly={isCalc || isReadOnly}
                                className={`w-full p-2 bg-transparent text-sm text-white focus:bg-white/5 focus:outline-none rounded transition-colors ${isCalc ? 'font-bold text-teal-400 cursor-default' : ''}`}
                              />
                            </td>
                          );
                        })}
                        {!isReadOnly && (
                          <td className="p-2 text-center">
                            <button onClick={() => removeRow(rIndex, "unit")} className="text-red-500/40 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {unitRows.length === 0 && (
                  <div className="p-12 text-center text-white/20">
                    <Calendar size={32} className="mx-auto mb-3 opacity-50" />
                    <p>No unit data. Click Add Row or Paste data.</p>
                  </div>
                )}
              </div>
            </div>

            {/* CUSTOMER TABLE */}
            {customerColumns.length > 2 && (
              <div className="glass-card overflow-hidden flex flex-col">
                <div className="p-4 border-b border-white/5 bg-white/2 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-bold text-white">Customer Specific Operations</h2>
                    <div className="flex items-center gap-2 mt-1 text-white/40">
                      <ClipboardPaste size={12} />
                      <span className="text-xs font-medium">Click inside table and press <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-white">Ctrl+V</kbd> to paste from Excel/Sheets.</span>
                    </div>
                  </div>
                  {!isReadOnly && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePasteButton("customer")}
                        className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white font-bold text-sm flex items-center gap-2 transition-all"
                      >
                        <ClipboardPaste size={14} /> PASTE DATA
                      </button>
                      <button onClick={() => addRow("customer")} className="px-4 py-2 rounded-lg bg-[#EAB308]/10 text-[#EAB308] hover:bg-[#EAB308] hover:text-black font-bold text-sm flex items-center gap-2 transition-all">
                        <Plus size={16} /> ADD ROW
                      </button>
                    </div>
                  )}
                </div>
                
                <div
                  className="flex-1 overflow-auto custom-scrollbar max-h-[50vh]"
                  tabIndex={0}
                  onPaste={isReadOnly ? undefined : (e) => handlePaste(e, "customer")}
                  style={{ outline: "none" }}
                >
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-[#121212] z-10 shadow-md">
                      <tr>
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-white/30 border-b border-white/10 w-12 text-center">#</th>
                        {customerColumns.map(c => (
                          <th key={c.key} className="p-3 text-[10px] font-black uppercase tracking-wider text-[#EAB308]/80 border-b border-white/10 whitespace-nowrap">
                            {c.label}
                          </th>
                        ))}
                        {!isReadOnly && <th className="p-3 border-b border-white/10 w-12"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {customerRows.map((row, rIndex) => (
                        <tr key={row.id} className="hover:bg-white/5 group border-b border-white/5 last:border-0 transition-colors">
                          <td className="p-2 text-center text-xs text-white/20 font-mono">{rIndex + 1}</td>
                          {customerColumns.map(c => {
                            const colOrigName = c.key.replace(/^unit_|^customer_/, "");
                            const isCalc = formulas.some(f =>
                              (f.target_column && (f.target_column === colOrigName || f.target_column === c.label)) ||
                              (!f.target_column && (f.formula_name === c.label || f.formula_name === colOrigName))
                            );
                            return (
                              <td key={c.key} className={`p-1 min-w-[150px] ${isCalc ? 'bg-amber-500/5' : ''}`}>
                                  {c.type === "dropdown" ? (
                                    <select 
                                      value={row[c.key] || ""}
                                      onChange={e => handleCellChange(rIndex, c.key, e.target.value, "customer")}
                                      onPaste={isReadOnly ? undefined : (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const text = e.clipboardData.getData("text");
                                        processPasteData(text, "customer");
                                      }}
                                      disabled={isReadOnly}
                                      className="w-full p-2 bg-transparent text-sm text-white focus:bg-white/5 focus:outline-none rounded transition-colors appearance-none"
                                      style={{
                                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                                        backgroundRepeat: 'no-repeat',
                                        backgroundPosition: 'right 0.5rem center',
                                        backgroundSize: '1em 1em',
                                        paddingRight: '2rem'
                                      }}
                                    >
                                      {c.options.map(opt => <option key={opt} value={opt} className="bg-gray-800">{opt}</option>)}
                                    </select>
                                  ) : (
                                    <input
                                      type={c.type === "date" ? "date" : "text"}
                                      value={row[c.key] || ""}
                                      onChange={e => handleCellChange(rIndex, c.key, e.target.value, "customer")}
                                      onPaste={isReadOnly || isCalc ? undefined : (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const text = e.clipboardData.getData("text");
                                        processPasteData(text, "customer");
                                      }}
                                      placeholder={isCalc ? "Auto" : "-"}
                                      readOnly={isCalc || isReadOnly}
                                      className={`w-full p-2 bg-transparent text-sm text-white focus:bg-white/5 focus:outline-none rounded transition-colors ${isCalc ? 'font-bold text-amber-400 cursor-default' : ''}`}
                                    />
                                  )}
                                </td>
                              );
                            })}
                            {!isReadOnly && (
                              <td className="p-2 text-center">
                                <button onClick={() => removeRow(rIndex, "customer")} className="text-red-500/40 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            )}
                          </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="glass-card p-12 text-center text-white/30 border border-dashed border-white/10">
          Please select a unit from the dropdown above to manage data.
        </div>
      )}
    </div>
  );
};

export default UnitDataEntry;
