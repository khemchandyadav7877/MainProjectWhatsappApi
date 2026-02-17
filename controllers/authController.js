const authTable = require("../models/auth");
const bcrypt = require("bcrypt");

// ===================== SIGNUP =====================
exports.SignUp = async (req, res) => {
  try {
    const { firstName, lastName, email, password, contactNumber, dob, role } = req.body;

    console.log("=== Signup Request ===");
    console.log("Request body:", req.body);

    // ✅ Validation
    const errors = [];
    if (!firstName?.trim()) errors.push("First name is required");
    if (!lastName?.trim()) errors.push("Last name is required");
    if (!email?.trim()) errors.push("Email is required");
    if (!password) errors.push("Password is required");

    if (errors.length > 0) {
      return res.status(400).json({ 
        status: 400,
        success: false,
        message: errors[0] 
      });
    }

    // ✅ Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ 
        status: 400,
        success: false,
        message: "Please enter a valid email address" 
      });
    }

    // ✅ Password validation
    if (password.length < 6) {
      return res.status(400).json({ 
        status: 400,
        success: false,
        message: "Password must be at least 6 characters" 
      });
    }

    // ✅ Check if email exists
    const emailCheck = await authTable.findOne({ email: email.trim().toLowerCase() });
    if (emailCheck) {
      return res.status(400).json({ 
        status: 400,
        success: false,
        message: "Email already registered" 
      });
    }

    // ✅ Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // ✅ Determine role
    let userRole = "user"; // Default
    const validRoles = ["SuperAdmin", "Educator", "Trainer", "Student", "user"];
    if (role && validRoles.includes(role)) {
      userRole = role;
    }

    console.log("Creating user with role:", userRole);

    // ✅ Create new user
    const newUser = new authTable({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      contactNumber: contactNumber || "",
      dob: dob || null,
      role: userRole,
      status: "Active",
      activeStatus: "Active",
      title: role === "Student" ? "Student" : 
             role === "Educator" ? "Educator" :
             role === "Trainer" ? "Trainer" : "New User",
      passwordChangedAt: new Date(),
      joinDate: new Date()
    });

    // ✅ Add to password history
    newUser.passwordHistory.push(hashedPassword);

    // ✅ Log activity
    newUser.activityLog.push({
      action: "Account Created",
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { 
        method: "Email Signup",
        role: userRole 
      }
    });

    await newUser.save();

    console.log("✅ User created successfully:", newUser.email);

    return res.status(201).json({
      status: 201,
      success: true,
      message: "Account created successfully! You can now login.",
      user: {
        _id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        role: newUser.role
      }
    });

  } catch (error) {
    console.error("❌ Signup error:", error);
    return res.status(500).json({ 
      status: 500,
      success: false,
      message: "Server error. Please try again." 
    });
  }
};

// ===================== LOGIN =====================
exports.Login = async (req, res) => {
  console.log("=== Login Request ===");
  console.log("Email:", req.body.email);
  
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        status: 400,
        success: false,
        message: "Email and password required" 
      });
    }

    // ✅ Find user
    const user = await authTable.findOne({ 
      email: email.trim().toLowerCase() 
    });
    
    if (!user) {
      console.log("❌ User not found:", email);
      return res.status(400).json({ 
        status: 400,
        success: false,
        message: "Invalid email or password" 
      });
    }

    console.log("User found:", user.email, "Role:", user.role);

    // ✅ Check account status
    if (user.status !== "Active") {
      return res.status(400).json({ 
        status: 400,
        success: false,
        message: "Your account is not active. Please contact administrator." 
      });
    }

    // ✅ Verify password with bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log("❌ Password mismatch for:", user.email);
      return res.status(400).json({ 
        status: 400,
        success: false,
        message: "Invalid email or password" 
      });
    }

    // ✅ SESSION TRACKING
    const loginTime = new Date();
    const sessionId = req.sessionID;
    
    // Update user in database
    user.loginHistory.push({
      loginTime: loginTime,
      sessionId: sessionId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    user.loginCount += 1;
    user.sessions += 1;
    user.lastLogin = loginTime;
    user.currentSessionId = sessionId;
    
    // Update active level based on login count
    if (user.loginCount > 50) {
      user.activeLevel = "High";
    } else if (user.loginCount > 10) {
      user.activeLevel = "Medium";
    }
    
    // ✅ Log activity
    user.activityLog.push({
      action: "Login",
      timestamp: loginTime,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { 
        method: "Email Login", 
        sessionId: sessionId 
      }
    });

    await user.save();

    // ✅ STORE IN EXPRESS SESSION
    req.session.userId = user._id.toString();
    req.session.user = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      contactNumber: user.contactNumber,
      profileImage: user.profileImage,
      activeLevel: user.activeLevel
    };
    
    req.session.isAuthenticated = true;
    req.session.loginTime = loginTime;
    req.session.role = user.role;

    // Set session expiry (30 days)
    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;

    console.log("✅ Login successful for:", user.email, "Role:", user.role);

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Login successful",
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        contactNumber: user.contactNumber,
        dob: user.dob,
        profileImage: user.profileImage || null,
        activeLevel: user.activeLevel,
        joinDate: user.joinDate,
        lastLogin: user.lastLogin
      },
      session: {
        id: sessionId,
        loginTime: loginTime,
        loginCount: user.loginCount
      }
    });

  } catch (error) {
    console.error("❌ Login error:", error);
    return res.status(500).json({ 
      status: 500,
      success: false,
      message: "Server error. Please try again." 
    });
  }
};

// ===================== LOGOUT =====================
exports.Logout = async (req, res) => {
  console.log("=== Logout Request ===");
  
  try {
    if (!req.session.user) {
      return res.status(400).json({ 
        status: 400,
        success: false,
        message: "No user logged in" 
      });
    }

    const userId = req.session.user._id;
    const sessionId = req.sessionID;
    const logoutTime = new Date();
    
    console.log("Logging out user ID:", userId);

    // Find user and update logout time in database
    const user = await authTable.findById(userId);
    if (user) {
      // Find the current session in loginHistory
      const sessionIndex = user.loginHistory.findIndex(
        session => session.sessionId === sessionId && !session.logoutTime
      );
      
      if (sessionIndex !== -1) {
        const loginTime = user.loginHistory[sessionIndex].loginTime;
        const duration = Math.floor((logoutTime - loginTime) / 1000);
        
        user.loginHistory[sessionIndex].logoutTime = logoutTime;
        user.loginHistory[sessionIndex].duration = duration;
        user.currentSessionId = null;
        
        // Log activity
        user.activityLog.push({
          action: "Logout",
          timestamp: logoutTime,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
        
        await user.save();
      }
    }

    // Destroy express session
    req.session.destroy((err) => {
      if (err) {
        console.error("❌ Session destroy error:", err);
        return res.status(500).json({ 
          status: 500,
          success: false,
          message: "Error logging out" 
        });
      }
      
      console.log("✅ Logout successful for user ID:", userId);
      return res.status(200).json({
        status: 200,
        success: true,
        message: "Logout successful",
        logoutTime: logoutTime
      });
    });

  } catch (error) {
    console.error("❌ Logout error:", error);
    return res.status(500).json({ 
      status: 500,
      success: false,
      message: "Server error during logout" 
    });
  }
};

// ===================== CHECK SESSION =====================
exports.CheckSession = async (req, res) => {
  try {
    if (req.session.isAuthenticated && req.session.user) {
      // Fetch fresh user data from database
      const user = await authTable.findById(req.session.user._id);
      
      if (!user) {
        req.session.destroy();
        return res.status(200).json({
          status: 200,
          success: true,
          isAuthenticated: false,
          message: "User not found"
        });
      }

      return res.status(200).json({
        status: 200,
        success: true,
        isAuthenticated: true,
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          contactNumber: user.contactNumber,
          profileImage: user.profileImage,
          activeLevel: user.activeLevel,
          title: user.title || "",
          location: user.location || "",
          company: user.company || ""
        },
        session: {
          id: req.sessionID,
          loginTime: req.session.loginTime,
          role: user.role
        }
      });
    } else {
      return res.status(200).json({
        status: 200,
        success: true,
        isAuthenticated: false,
        message: "No active session"
      });
    }
  } catch (error) {
    console.error("❌ Session check error:", error);
    return res.status(500).json({ 
      status: 500,
      success: false,
      message: "Server error checking session" 
    });
  }
};

// ===================== GET USER PROFILE =====================
exports.GetProfile = async (req, res) => {
  console.log("=== Get Profile Request ===");
  console.log("Session user:", req.session.user);
  
  try {
    if (!req.session.isAuthenticated) {
      return res.status(401).json({ 
        status: 401,
        success: false,
        message: "Not authenticated" 
      });
    }

    const user = await authTable.findById(req.session.user._id);
    if (!user) {
      return res.status(404).json({ 
        status: 404,
        success: false,
        message: "User not found" 
      });
    }

    console.log("✅ Profile data fetched for:", user.email);

    return res.status(200).json({
      status: 200,
      success: true,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        contactNumber: user.contactNumber,
        dob: user.dob,
        profileImage: user.profileImage || null,
        loginCount: user.loginCount,
        activeLevel: user.activeLevel,
        lastLogin: user.lastLogin,
        title: user.title || "",
        bio: user.bio || "",
        location: user.location || "",
        company: user.company || "",
        technicalSkills: user.technicalSkills || [],
        joinDate: user.joinDate,
        status: user.status
      }
    });
  } catch (error) {
    console.error("❌ Get profile error:", error);
    return res.status(500).json({ 
      status: 500,
      success: false,
      message: "Server error" 
    });
  }
};

// ===================== CHANGE PASSWORD =====================
exports.ChangePassword = async (req, res) => {
  console.log("=== Change Password Request ===");
  console.log("Session user:", req.session.user);
  
  try {
    if (!req.session.isAuthenticated || !req.session.user) {
      console.log("❌ User not authenticated");
      return res.status(401).json({ 
        status: 401,
        success: false,
        message: "Authentication required. Please login again." 
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        status: 400,
        success: false,
        message: "Current password and new password are required." 
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ 
        status: 400,
        success: false,
        message: "New password must be at least 8 characters long." 
      });
    }

    const user = await authTable.findById(req.session.user._id);
    if (!user) {
      console.log("❌ User not found in database");
      return res.status(404).json({ 
        status: 404,
        success: false,
        message: "User not found." 
      });
    }

    console.log("User found:", user.email);

    // ✅ Verify current password with bcrypt
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      console.log("❌ Current password incorrect");
      return res.status(400).json({ 
        status: 400,
        success: false,
        message: "Current password is incorrect." 
      });
    }

    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ 
        status: 400,
        success: false,
        message: "New password must be different from current password." 
      });
    }

    // ✅ Hash new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    user.password = hashedNewPassword;
    user.passwordChangedAt = new Date();
    
    // Add password history
    if (user.passwordHistory) {
      user.passwordHistory.push(hashedNewPassword);
      if (user.passwordHistory.length > 3) {
        user.passwordHistory.shift();
      }
    }
    
    // Log activity
    user.activityLog.push({
      action: "password_change",
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    await user.save();
    
    console.log("✅ Password changed successfully for:", user.email);

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Password changed successfully!",
      timestamp: new Date()
    });

  } catch (error) {
    console.error("❌ Change password error:", error);
    return res.status(500).json({ 
      status: 500,
      success: false,
      message: "Server error. Please try again later." 
    });
  }
};

// ===================== UPDATE PROFILE =====================
exports.UpdateProfile = async (req, res) => {
  console.log("=== Update Profile Request ===");
  console.log("Session user:", req.session.user);
  console.log("Request body:", req.body);
  
  try {
    if (!req.session.isAuthenticated || !req.session.user) {
      console.log("❌ User not authenticated");
      return res.status(401).json({ 
        status: 401,
        success: false,
        message: "Authentication required. Please login again." 
      });
    }

    const { 
      firstName, 
      lastName, 
      contactNumber, 
      dob, 
      bio, 
      location, 
      company, 
      title,
      technicalSkills 
    } = req.body;
    
    const user = await authTable.findById(req.session.user._id);
    if (!user) {
      console.log("❌ User not found in database");
      return res.status(404).json({ 
        status: 404,
        success: false,
        message: "User not found." 
      });
    }

    console.log("Updating user:", user.email);
    
    // Track changes
    const changes = {};
    
    if (firstName !== undefined && firstName !== user.firstName) {
      user.firstName = firstName;
      changes.firstName = true;
    }
    if (lastName !== undefined && lastName !== user.lastName) {
      user.lastName = lastName;
      changes.lastName = true;
    }
    if (contactNumber !== undefined && contactNumber !== user.contactNumber) {
      user.contactNumber = contactNumber;
      changes.contactNumber = true;
    }
    if (dob !== undefined) {
      user.dob = dob;
      changes.dob = true;
    }
    if (bio !== undefined && bio !== user.bio) {
      user.bio = bio;
      changes.bio = true;
    }
    if (location !== undefined && location !== user.location) {
      user.location = location;
      changes.location = true;
    }
    if (company !== undefined && company !== user.company) {
      user.company = company;
      changes.company = true;
    }
    if (title !== undefined && title !== user.title) {
      user.title = title;
      changes.title = true;
    }
    if (technicalSkills !== undefined) {
      user.technicalSkills = Array.isArray(technicalSkills) ? technicalSkills : [technicalSkills];
      changes.technicalSkills = true;
    }

    // Update session data
    if (firstName !== undefined) req.session.user.firstName = firstName;
    if (lastName !== undefined) req.session.user.lastName = lastName;
    if (contactNumber !== undefined) req.session.user.contactNumber = contactNumber;

    // Log activity if any changes
    if (Object.keys(changes).length > 0) {
      user.activityLog.push({
        action: "profile_update",
        timestamp: new Date(),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        changes: changes
      });
    }

    await user.save();
    
    console.log("✅ Profile updated for:", user.email);

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Profile updated successfully!",
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        contactNumber: user.contactNumber,
        dob: user.dob,
        bio: user.bio,
        location: user.location,
        company: user.company,
        title: user.title,
        profileImage: user.profileImage,
        technicalSkills: user.technicalSkills
      }
    });

  } catch (error) {
    console.error("❌ Update profile error:", error);
    return res.status(500).json({ 
      status: 500,
      success: false,
      message: "Server error. Please try again later." 
    });
  }
};

// ===================== UPLOAD PROFILE PHOTO =====================
exports.UploadPhoto = async (req, res) => {
  console.log("=== Upload Photo Request ===");
  console.log("Session user:", req.session.user);
  console.log("File:", req.file);
  
  try {
    if (!req.session.isAuthenticated || !req.session.user) {
      console.log("❌ User not authenticated");
      return res.status(401).json({ 
        status: 401,
        success: false,
        message: "Authentication required. Please login again." 
      });
    }

    if (!req.file) {
      console.log("❌ No file uploaded");
      return res.status(400).json({ 
        status: 400,
        success: false,
        message: "No file uploaded" 
      });
    }

    const user = await authTable.findById(req.session.user._id);
    if (!user) {
      console.log("❌ User not found in database");
      return res.status(404).json({ 
        status: 404,
        success: false,
        message: "User not found." 
      });
    }

    console.log("Uploading photo for:", user.email);
    
    // Save file path
    const filePath = `/upload/${req.file.filename}`;
    user.profileImage = filePath;
    
    // Update session
    req.session.user.profileImage = filePath;
    
    // Log activity
    user.activityLog.push({
      action: "photo_upload",
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      filename: req.file.filename
    });

    await user.save();
    
    // Return full URL
    const fullUrl = `${req.protocol}://${req.get('host')}${filePath}`;
    
    console.log("✅ Photo uploaded:", fullUrl);

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Profile photo uploaded successfully",
      profileImage: fullUrl
    });
  } catch (error) {
    console.error("❌ Upload photo error:", error);
    return res.status(500).json({ 
      status: 500,
      success: false,
      message: "Server error uploading photo" 
    });
  }
};

// ===================== CHECK ROLE ACCESS =====================
exports.CheckRoleAccess = async (req, res) => {
  console.log("=== Check Role Access ===");
  
  try {
    if (!req.session.isAuthenticated || !req.session.user) {
      return res.status(401).json({ 
        status: 401,
        success: false,
        message: "Authentication required" 
      });
    }

    const { requiredRole } = req.body;
    
    if (!requiredRole) {
      return res.status(400).json({ 
        status: 400,
        success: false,
        message: "Required role not specified" 
      });
    }

    const user = await authTable.findById(req.session.user._id);
    if (!user) {
      return res.status(404).json({ 
        status: 404,
        success: false,
        message: "User not found" 
      });
    }

    // Check if user has required role
    const hasAccess = user.role === requiredRole || 
                      (requiredRole === "user" && ["Student", "Educator", "Trainer", "SuperAdmin"].includes(user.role)) ||
                      (user.role === "SuperAdmin"); // SuperAdmin has all access

    return res.status(200).json({
      status: 200,
      success: true,
      hasAccess: hasAccess,
      userRole: user.role,
      requiredRole: requiredRole,
      message: hasAccess ? "Access granted" : "Access denied"
    });

  } catch (error) {
    console.error("❌ Check role error:", error);
    return res.status(500).json({ 
      status: 500,
      success: false,
      message: "Server error" 
    });
  }
};