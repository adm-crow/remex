//! Windows Job Object lifecycle binding.
//!
//! Without this, force-killing Remex Studio (Task Manager → End Task, crash, etc.)
//! leaves the Python sidecar running, holding port 8000 hostage on the next launch.
//!
//! We create a single Job Object at startup configured with
//! `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. When the parent process terminates by any
//! means, the kernel closes our last handle to the job, which triggers automatic
//! termination of every assigned child.

use std::ptr;
use std::sync::OnceLock;

use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

/// Newtype wrapping the raw HANDLE so it can be safely sent across threads
/// (the OS handle itself is thread-safe; `HANDLE = *mut c_void` is not Send by default).
#[derive(Copy, Clone)]
struct JobHandle(HANDLE);
unsafe impl Send for JobHandle {}
unsafe impl Sync for JobHandle {}

static JOB: OnceLock<Option<JobHandle>> = OnceLock::new();

/// Create the process-killing Job Object exactly once for the lifetime of the
/// parent process. Subsequent calls are no-ops and return the cached handle.
fn ensure_job() -> Option<HANDLE> {
    JOB.get_or_init(|| {
        unsafe {
            let h = CreateJobObjectW(ptr::null(), ptr::null());
            if h.is_null() {
                return None;
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                h,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if ok == 0 {
                CloseHandle(h);
                return None;
            }
            Some(JobHandle(h))
        }
    })
    .map(|j| j.0)
}

/// Bind ``process_handle`` to the lifecycle of the parent. Safe to call on every
/// spawn — silently ignores errors (the worst case is the pre-Job-Object behaviour
/// of leaking on hard kill).
pub fn assign_to_job(process_handle: HANDLE) {
    let Some(job) = ensure_job() else { return };
    unsafe {
        let _ = AssignProcessToJobObject(job, process_handle);
    }
}
