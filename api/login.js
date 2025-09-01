const { createClient } = require('@supabase/supabase-js');

// إعدادات الاتصال بـ Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://vmvjgwnnlpyucwsvpsso.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtdmpnd25ubHB5dWN3c3Zwc3NvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NjYzOTcsImV4cCI6MjA3MjI0MjM5N30.MVt07pKOkyx2nkBeLNhOPcGUcV-hZvwA_VD7YFEatYM';

// إنشاء عميل Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// تسجيل نشاط المستخدم
async function addActivity(activityType, username, details) {
  try {
    const { error } = await supabase
      .from('api_logs')
      .insert([
        {
          activity_type: activityType,
          username: username,
          details: details,
          created_at: new Date().toISOString()
        }
      ]);
    
    if (error) {
      console.error('خطأ في تسجيل النشاط:', error);
    }
  } catch (error) {
    console.error('استثناء في تسجيل النشاط:', error);
  }
}

module.exports = async (req, res) => {
  // إعداد CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // التعامل مع طلبات OPTIONS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // التأكد من أن الطلب هو POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'طريقة غير مسموح بها' });
  }

  try {
    console.log('محاولة تسجيل دخول جديدة');
    const { username, password, isAdmin } = req.body;
    
    console.log('بيانات تسجيل الدخول المستلمة:', { username, passwordProvided: !!password, isAdmin });
    
    if (!username || !password) {
      console.log('خطأ: بيانات تسجيل الدخول غير مكتملة');
      return res.status(200).json({ success: false, message: 'يجب توفير اسم المستخدم وكلمة المرور' });
    }
    
    let account;
    
    try {
      // البحث عن المستخدم في جدول users بغض النظر عن نوع المستخدم
      console.log('جاري البحث عن المستخدم في قاعدة البيانات');
      const { data, error: userError } = await supabase
        .from('users')
        .select('*');
      
      if (userError) {
        console.error('خطأ في البحث عن المستخدم:', userError);
        return res.status(200).json({ 
          success: false, 
          message: 'حدث خطأ أثناء البحث عن المستخدم',
          details: userError.message || 'خطأ غير معروف'
        });
      }
      
      console.log(`تم استرجاع ${data ? data.length : 0} مستخدم من قاعدة البيانات`);
      
      // البحث عن المستخدم في البيانات المسترجعة
      account = data.find(user => 
        (user.user_name === username || 
         user.name === username || 
         user.email === username)
      );
      
      console.log('نتيجة البحث عن المستخدم:', { userFound: !!account });
      
      if (!account) {
        return res.status(200).json({ success: false, message: 'اسم المستخدم غير موجود. يرجى التواصل مع المدير.' });
      }
      
      // التحقق من كلمة المرور
      const isPasswordValid = account.password === password || account.password_hash === password;
      console.log('نتيجة التحقق من كلمة المرور:', { isPasswordValid });
      
      if (!isPasswordValid) {
        return res.status(200).json({ success: false, message: 'كلمة المرور غير صحيحة' });
      }
      
      // التحقق من صلاحيات المدير إذا كان المستخدم يحاول تسجيل الدخول كمدير
      if (isAdmin && account.role !== 'admin') {
        return res.status(200).json({ success: false, message: 'ليس لديك صلاحيات كافية للوصول إلى لوحة التحكم' });
      }
      
      console.log('تم تسجيل الدخول بنجاح:', username, isAdmin ? '(مدير)' : '(مستخدم عادي)');
      
      try {
        // تسجيل معلومات الجهاز
        const ip = req.headers['x-forwarded-for'] || 'غير معروف';
        const deviceName = req.headers['user-agent'] || 'غير معروف';
        
        // إضافة أو تحديث معلومات الجهاز
        const { error: deviceError } = await supabase
          .from('user_devices')
          .upsert([
            {
              user_id: account.id,
              device_name: deviceName,
              ip_address: ip,
              last_login: new Date().toISOString()
            }
          ]);
        
        if (deviceError) {
          console.error('خطأ في تسجيل معلومات الجهاز:', deviceError);
          // نستمر بالرغم من الخطأ
        }
      } catch (deviceLogError) {
        console.error('استثناء في تسجيل معلومات الجهاز:', deviceLogError);
        // نستمر بالرغم من الخطأ
      }
      
      try {
        // تسجيل نشاط تسجيل الدخول
        await addActivity('login', username, account.role === 'admin' ? 'تسجيل دخول مدير' : 'تسجيل دخول مستخدم');
      } catch (activityLogError) {
        console.error('استثناء في تسجيل النشاط:', activityLogError);
        // نستمر بالرغم من الخطأ
      }
      
      // إعداد معلومات المستخدم للإرجاع
      return res.status(200).json({
        success: true,
        message: 'تم تسجيل الدخول بنجاح',
        userId: account.id,
        username: account.user_name || account.name || account.email,
        isAdmin: account.role === 'admin',
        user: {
          id: account.id,
          username: account.user_name || account.name || account.email,
          email: account.email,
          role: account.role,
          created_at: account.created_at
        }
      });
    } catch (error) {
      console.error('استثناء غير متوقع في تسجيل الدخول:', error);
      return res.status(200).json({ 
        success: false, 
        message: 'حدث خطأ أثناء تسجيل الدخول',
        details: error.message || 'خطأ غير معروف',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  } catch (error) {
    console.error('خطأ عام في معالجة الطلب:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ في الخادم',
      details: error.message || 'خطأ غير معروف'
    });
  }
};