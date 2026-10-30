export type ExcelCell=string|number|null;
export type ReportSheet={name:string;headers:string[];rows:ExcelCell[][];metadata?:[string,string][]};
/** Load the writer only when exporting; IDs and user text remain literal string cells. */
export async function buildWorkbook(reports:ReportSheet[]){
 const {Workbook}=await import('exceljs');
 const book=new Workbook();book.creator='ME-Smart';book.created=new Date();
 for(const report of reports){
  const sheet=book.addWorksheet(report.name);
  for(const pair of report.metadata??[])sheet.addRow(pair);
  if(report.metadata?.length)sheet.addRow([]);
  const header=sheet.addRow(report.headers),headerNumber=header.number;
  header.height=30;header.eachCell(cell=>{cell.font={name:'Tahoma',bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF193B60'}};cell.alignment={vertical:'middle',wrapText:true}});
  for(const values of report.rows){const row=sheet.addRow(values);row.eachCell((cell,col)=>{cell.font={name:'Tahoma',size:11};cell.alignment={vertical:'top',wrapText:true};if(typeof values[col-1]==='string')cell.numFmt='@';if(typeof values[col-1]==='number'&&report.headers[col-1].includes('(%)'))cell.numFmt='0.00';if(row.number%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF0F5FA'}}})}
  sheet.columns.forEach((col,i)=>{const title=report.headers[i]??'';col.width=/ชื่อ|หัวข้อ|หมายเหตุ|เหตุผล/.test(title)?36:/รหัสนักศึกษา/.test(title)?22:/วันที่|ช่วง|สัปดาห์|ผลประเมิน/.test(title)?23:18});
  sheet.views=[{state:'frozen',ySplit:headerNumber}];
  sheet.autoFilter={from:{row:headerNumber,column:1},to:{row:Math.max(headerNumber,sheet.rowCount),column:report.headers.length}};
  sheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};sheet.pageSetup.printTitlesRow=`${headerNumber}:${headerNumber}`;
 }
 return book;
}
export async function downloadExcel(name:string,reports:ReportSheet[]){
 const book=await buildWorkbook(reports),buffer=await book.xlsx.writeBuffer();
 const blob=new Blob([new Uint8Array(buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
