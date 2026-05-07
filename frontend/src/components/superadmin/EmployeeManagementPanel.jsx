import { Fragment, useState, useEffect } from 'react'
import { 
  fetchBiometricEmployees, 
  upsertBiometricEmployee, 
  deleteBiometricEmployee,
  addBiometricEmployeeWithPhoto,
  addBiometricEmployeePhoto,
  fetchBiometricEmployeePhoto
} from '../../services/superAdminApi'

export default function EmployeeManagementPanel() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ employee_id: '', name: '', department: 'General' })
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoDataUrl, setPhotoDataUrl] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [photoEmployeeId, setPhotoEmployeeId] = useState(null)
  const [photoEmployeeFile, setPhotoEmployeeFile] = useState(null)
  const [photoEmployeePreview, setPhotoEmployeePreview] = useState('')
  const [photoEmployeeDataUrl, setPhotoEmployeeDataUrl] = useState('')
  const [search, setSearch] = useState('')
  const [employeePhotoUrls, setEmployeePhotoUrls] = useState({})

  useEffect(() => {
    loadEmployees()
  }, [])

  function resetPhotoState() {
    setPhotoFile(null)
    setPhotoPreview('')
    setPhotoDataUrl('')
  }

  function resetEmployeePhotoState() {
    setPhotoEmployeeId(null)
    setPhotoEmployeeFile(null)
    setPhotoEmployeePreview('')
    setPhotoEmployeeDataUrl('')
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Unable to read photo'))
      reader.readAsDataURL(file)
    })
  }

  async function loadEmployees() {
    setLoading(true)
    try {
      const data = await fetchBiometricEmployees()
      setEmployees(data || [])
      setEmployeePhotoUrls((current) => {
        Object.values(current).forEach((url) => {
          if (url) URL.revokeObjectURL(url)
        })
        return {}
      })

      const photoPairs = await Promise.all((data || []).map(async (employee) => {
        if (!employee.embedding_count) return [employee.employee_id, '']
        const url = await fetchBiometricEmployeePhoto(employee.employee_id)
        return [employee.employee_id, url || '']
      }))

      const photoMap = Object.fromEntries(photoPairs.filter(([, url]) => Boolean(url)))
      setEmployeePhotoUrls(photoMap)
      setError(null)
    } catch (err) {
      setError('Failed to load employees')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!editForm.employee_id || !editForm.name) return

    try {
      if (isAdding) {
        if (!photoDataUrl) {
          alert('Please add the employee first photo before saving.')
          return
        }

        await addBiometricEmployeeWithPhoto({
          ...editForm,
          images: [photoDataUrl],
        })
      } else {
        await upsertBiometricEmployee(editForm)
      }

      setEditingId(null)
      setIsAdding(false)
      resetEmployeePhotoState()
      setEditForm({ employee_id: '', name: '', department: 'General' })
      resetPhotoState()
      await loadEmployees()
    } catch (err) {
      alert('Failed to save employee: ' + err.message)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Are you sure you want to delete this employee mapping?')) return

    try {
      await deleteBiometricEmployee(id)
      await loadEmployees()
    } catch (err) {
      alert('Failed to delete employee: ' + err.message)
    }
  }

  function startEdit(emp) {
    setEditingId(emp.employee_id)
    setEditForm({ employee_id: emp.employee_id, name: emp.name, department: emp.department || 'General' })
    setIsAdding(false)
    resetEmployeePhotoState()
    resetPhotoState()
  }

  function startAdd() {
    setIsAdding(true)
    setEditingId(null)
    resetEmployeePhotoState()
    setEditForm({ employee_id: '', name: '', department: 'General' })
    resetPhotoState()
  }

  function startAddPhoto(emp) {
    resetEmployeePhotoState()
    setPhotoEmployeeId(emp.employee_id)
    setEditingId(null)
    setIsAdding(false)
    resetPhotoState()
  }

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      resetPhotoState()
      return
    }

    try {
      const dataUrl = await fileToDataUrl(file)
      setPhotoFile(file)
      setPhotoPreview(dataUrl)
      setPhotoDataUrl(dataUrl)
    } catch (err) {
      resetPhotoState()
      alert(err.message || 'Unable to load the selected photo')
    }
  }

  async function handleEmployeePhotoChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      setPhotoEmployeeFile(null)
      setPhotoEmployeePreview('')
      setPhotoEmployeeDataUrl('')
      return
    }

    try {
      const dataUrl = await fileToDataUrl(file)
      setPhotoEmployeeFile(file)
      setPhotoEmployeePreview(dataUrl)
      setPhotoEmployeeDataUrl(dataUrl)
    } catch (err) {
      setPhotoEmployeeFile(null)
      setPhotoEmployeePreview('')
      setPhotoEmployeeDataUrl('')
      alert(err.message || 'Unable to load the selected photo')
    }
  }

  async function handleSaveEmployeePhoto() {
    if (!photoEmployeeId || !photoEmployeeDataUrl) {
      alert('Please select a photo first.')
      return
    }

    try {
      await addBiometricEmployeePhoto(photoEmployeeId, {
        images: [photoEmployeeDataUrl],
      })
      resetEmployeePhotoState()
      await loadEmployees()
    } catch (err) {
      alert('Failed to add employee photo: ' + err.message)
    }
  }

  const filteredEmployees = employees.filter(emp => 
    String(emp.employee_id || '').toLowerCase().includes(search.toLowerCase()) ||
    String(emp.name || '').toLowerCase().includes(search.toLowerCase()) ||
    String(emp.department || '').toLowerCase().includes(search.toLowerCase())
  )

  function getEmployeePhotoUrl(employeeId) {
    return employeePhotoUrls[employeeId] || ''
  }

  return (
    <div className="mb-4 rounded-[32px] border border-slate-200/80 bg-white/92 p-8 shadow-[0_20px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-all hover:shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">Employee Biometric Management</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">View and manage employee ID to name mappings for biometric logs</p>
        </div>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <input
            type="text"
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-5 py-2.5 text-sm font-medium transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 sm:w-64"
          />
          <button
            onClick={startAdd}
            className="flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] hover:bg-blue-700 active:scale-[0.98]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="rounded-[24px] border-2 border-blue-100 bg-blue-50/30 p-6">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-blue-600">Add New Employee With First Photo</h3>
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">Employee ID</label>
                <input
                  type="text"
                  placeholder="e.g. KA026"
                  value={editForm.employee_id}
                  onChange={(e) => setEditForm({ ...editForm, employee_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">Department</label>
                <input
                  type="text"
                  placeholder="e.g. Security"
                  value={editForm.department}
                  onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">First Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold transition-all file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                />
                <p className="text-[11px] font-medium text-slate-500">A passport-size photo generates the first embedding immediately.</p>
              </div>
              <div className="flex items-end gap-3">
                <button
                  onClick={handleSave}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white transition-all hover:bg-blue-700 active:scale-95"
                >
                  Save Employee
                </button>
                <button
                  onClick={() => setIsAdding(false)}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-95"
                >
                  Cancel
                </button>
              </div>
            </div>
            {photoPreview && (
              <div className="mt-5 flex items-center gap-4 rounded-2xl border border-blue-100 bg-white/80 p-4">
                <img
                  src={photoPreview}
                  alt="Employee preview"
                  className="h-20 w-16 rounded-xl border border-slate-200 object-cover"
                />
                <div>
                  <div className="text-sm font-bold text-slate-900">{photoFile?.name || 'Selected photo'}</div>
                  <div className="text-xs font-medium text-slate-500">This image will be embedded and stored as the enrollment sample.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-600">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50/30">
        <div className="overflow-x-auto max-h-[450px] overflow-y-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/50">
                <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Photo</th>
                <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Employee ID</th>
                <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Full Name</th>
                <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Department</th>
                <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Embeddings</th>
                <th className="px-6 py-4 text-right text-[11px] font-black uppercase tracking-wider text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                      <span className="text-sm font-bold text-slate-400">Fetching latest data...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center font-bold text-slate-400">
                    No employees found matching your criteria
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <Fragment key={emp.employee_id}>
                    <tr className="group transition-colors hover:bg-slate-50/80">
                      <td className="px-6 py-4">
                        {getEmployeePhotoUrl(emp.employee_id) ? (
                          <img
                            src={getEmployeePhotoUrl(emp.employee_id)}
                            alt={`${emp.name} photo`}
                            className="h-12 w-10 rounded-lg border border-slate-200 object-cover shadow-sm"
                          />
                        ) : (
                          <div className="flex h-12 w-10 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[10px] font-bold text-slate-400">
                            No
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-black text-slate-900">{emp.employee_id}</td>
                      <td className="px-6 py-4">
                        {editingId === emp.employee_id ? (
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full rounded-lg border border-blue-400 bg-white px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                          />
                        ) : (
                          <span className="text-sm font-semibold text-slate-600">{emp.name}</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {editingId === emp.employee_id ? (
                          <input
                            type="text"
                            value={editForm.department}
                            onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                            className="w-full rounded-lg border border-blue-400 bg-white px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                          />
                        ) : (
                          <span className="text-sm font-semibold text-slate-600">{emp.department || 'General'}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-600">{emp.embedding_count || 0}</td>
                      <td className="px-6 py-4 text-right">
                        {editingId === emp.employee_id ? (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={handleSave}
                              className="rounded-lg bg-green-600 px-3 py-1.5 text-[11px] font-bold text-white transition-all hover:bg-green-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded-lg bg-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-all hover:bg-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => startEdit(emp)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-all hover:bg-blue-600 hover:text-white"
                              title="Edit Name"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => startAddPhoto(emp)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition-all hover:bg-emerald-600 hover:text-white"
                              title="Add Photo"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7a2 2 0 012-2h2.586a1 1 0 00.707-.293l1.414-1.414A1 1 0 0110.414 3h3.172a1 1 0 01.707.293l1.414 1.414A1 1 0 0016.414 5H19a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11v4m-2-2h4" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(emp.employee_id)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600 transition-all hover:bg-red-600 hover:text-white"
                              title="Delete Mapping"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-14v4m-4-4h4m1 8H7a2 2 0 002 2h6a2 2 0 002-2H9z" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {photoEmployeeId === emp.employee_id && (
                      <tr className="bg-emerald-50/30">
                        <td colSpan="5" className="px-6 py-4">
                          <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-black uppercase tracking-wider text-emerald-600">Add Photo for {emp.employee_id}</div>
                                <div className="text-xs font-medium text-slate-500">This will append a new biometric embedding for the existing employee.</div>
                              </div>
                              <button
                                onClick={resetEmployeePhotoState}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50"
                              >
                                Close
                              </button>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                              <div className="space-y-1.5">
                                <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">Passport Photo</label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleEmployeePhotoChange}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold transition-all file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
                                />
                              </div>
                              <div className="flex gap-3">
                                <button
                                  onClick={handleSaveEmployeePhoto}
                                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-emerald-700 active:scale-95"
                                >
                                  Save Photo
                                </button>
                                <button
                                  onClick={resetEmployeePhotoState}
                                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                            {photoEmployeePreview && (
                              <div className="mt-4 flex items-center gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                                <img
                                  src={photoEmployeePreview}
                                  alt="Employee photo preview"
                                  className="h-20 w-16 rounded-xl border border-slate-200 object-cover"
                                />
                                <div>
                                  <div className="text-sm font-bold text-slate-900">{photoEmployeeFile?.name || 'Selected photo'}</div>
                                  <div className="text-xs font-medium text-slate-500">This sample will be appended to the employee's biometric embeddings.</div>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
