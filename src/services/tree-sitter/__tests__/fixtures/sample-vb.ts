export default `
' VB.NET Sample Code for Testing
Imports System
Imports System.Collections.Generic
Imports System.Linq

Namespace TestNamespaceDefinition
    Public Class TestClassDefinition
        Private _numbers As List(Of Integer)
        
        Public Property TestPropertyDefinition As String
        
        Public Event TestEventDefinition As EventHandler(Of EventArgs)
        
        Public Sub New()
            _numbers = New List(Of Integer) From {1, 2, 3, 4, 5}
        End Sub
        
        Public Function TestMethodDefinition() As String
            Return "Hello from VB.NET"
        End Function
        
        Public Async Function TestAsyncMethodDefinition() As Task(Of String)
            Await Task.Delay(100)
            Return "Async result"
        End Function
        
        Public Function TestLinqExpression() As IEnumerable(Of Integer)
            Dim result = From num In _numbers
                        Where num > 2
                        Select num
            Return result
        End Function
    End Class
    
    Public Interface ITestInterfaceDefinition
        Sub TestInterfaceMethod()
        Property TestInterfaceProperty As String
    End Interface
    
    Public Enum TestEnumDefinition
        Value1
        Value2
        Value3
    End Enum
    
    Public Structure TestStructDefinition
        Public Field1 As Integer
        Public Field2 As String
    End Structure
    
    Public Module TestModuleDefinition
        Public Function TestModuleFunction() As String
            Return "Module function"
        End Function
    End Module
    
    Public Delegate Sub TestDelegateDefinition(value As String)
End Namespace
`
